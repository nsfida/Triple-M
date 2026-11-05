//go:build windows

package main

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

// Native printing and PDF options (3.7). The page shows its own print panel
// (printer, copies, pages, paper, orientation, margins, colour, two-sided,
// scale, backgrounds, headers) and the app prints directly with WebView2's
// Print API, or saves a PDF with PrintToPdf. "More settings" still opens the
// Windows print dialog.
//
// Paper size, margins and scale are floating-point settings. Go passes them
// correctly on x64 only, so on ARM64 the page applies paper and margins with
// a CSS @page rule instead (it does that on every PC, so both agree).

const (
	wv7PrintToPdf  = 80
	wv16Print      = 113
	env6CreatePS   = 14
	psSetOrient    = 4
	psSetScale     = 6
	psSetPageW     = 8
	psSetPageH     = 10
	psSetMarginT   = 12
	psSetMarginB   = 14
	psSetMarginL   = 16
	psSetMarginR   = 18
	psSetBackgr    = 20
	psSetHeaders   = 24
	ps2SetRanges   = 30
	ps2SetCopies   = 34
	ps2SetCollate  = 36
	ps2SetColor    = 38
	ps2SetDuplex   = 40
	ps2SetPrinter  = 44
	printEnumLocal = 0x2
	printEnumConn  = 0x4
)

var (
	iidCoreWebView2_7        = guid{0x79c24d83, 0x09a3, 0x45ae, [8]byte{0x94, 0x18, 0x48, 0x7f, 0x32, 0xa5, 0x87, 0x40}}
	iidCoreWebView2Env6      = guid{0xe59ee362, 0xacbd, 0x4857, [8]byte{0x9a, 0x8e, 0xd3, 0x64, 0x4d, 0x94, 0x59, 0xa9}}
	iidCoreWebView2PrintSet2 = guid{0xca7f0e1f, 0x3484, 0x41d1, [8]byte{0x8c, 0x1a, 0x65, 0xcd, 0x44, 0xa6, 0x3f, 0x8d}}

	winspool               = syscall.NewLazyDLL("winspool.drv")
	procEnumPrintersW      = winspool.NewProc("EnumPrintersW")
	procGetDefaultPrinterW = winspool.NewProc("GetDefaultPrinterW")

	webView7       uintptr
	hPrintDone     *comHandler
	hPdfDone       *comHandler
	printBusy      bool
	pdfPendingPath string
	pdfSeq         int
)

type printerInfo4 struct {
	PrinterName *uint16
	ServerName  *uint16
	Attributes  uint32
}

func installedPrinters() []string {
	defer recoverOptional("printer list")
	var needed, returned uint32
	procEnumPrintersW.Call(printEnumLocal|printEnumConn, 0, 4, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 || needed > 4<<20 {
		return nil
	}
	buf := make([]byte, needed)
	r, _, _ := procEnumPrintersW.Call(printEnumLocal|printEnumConn, 0, 4, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed), uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 {
		return nil
	}
	size := unsafe.Sizeof(printerInfo4{})
	var names []string
	for i := uintptr(0); i < uintptr(returned); i++ {
		info := (*printerInfo4)(unsafe.Pointer(&buf[i*size]))
		if info.PrinterName != nil {
			names = append(names, wideToString(uintptr(unsafe.Pointer(info.PrinterName))))
		}
	}
	runtime.KeepAlive(buf)
	return sortedPrinters(names)
}

func defaultPrinter() string {
	var n uint32 = 512
	buf := make([]uint16, n)
	if r, _, _ := procGetDefaultPrinterW.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n))); r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

func floatPrintSettingsSupported() bool { return runtime.GOARCH == "amd64" }

func sendPrintInfo() {
	postToPage(map[string]interface{}{
		"type":     "print-info",
		"printers": installedPrinters(),
		"default":  defaultPrinter(),
		"direct":   webView16 != 0,
		"pdf":      webView7 != 0,
		"floats":   floatPrintSettingsSupported(),
	})
}

func boolArg(b bool) uintptr {
	if b {
		return 1
	}
	return 0
}

// newPrintSettings builds an ICoreWebView2PrintSettings from the options.
func newPrintSettings(o printOptions, forPDF bool) uintptr {
	if webEnvironment == nil {
		return 0
	}
	env6 := comQuery(uintptr(unsafe.Pointer(webEnvironment)), &iidCoreWebView2Env6)
	if env6 == 0 {
		return 0
	}
	defer releaseCOM(env6)
	var ps uintptr
	if !hrOK(vcall(env6, env6CreatePS, uintptr(unsafe.Pointer(&ps)))) || ps == 0 {
		return 0
	}
	orient := uintptr(0)
	if o.Orientation == "landscape" {
		orient = 1
	}
	vcall(ps, psSetOrient, orient)
	vcall(ps, psSetBackgr, boolArg(o.Backgrounds))
	vcall(ps, psSetHeaders, boolArg(o.Headers))
	if floatPrintSettingsSupported() {
		if w, h, ok := pageSizeInches(o); ok {
			vcall(ps, psSetPageW, uintptr(math.Float64bits(w)))
			vcall(ps, psSetPageH, uintptr(math.Float64bits(h)))
		}
		if m, ok := marginInches[o.Margins]; ok {
			for _, idx := range []int{psSetMarginT, psSetMarginB, psSetMarginL, psSetMarginR} {
				vcall(ps, idx, uintptr(math.Float64bits(m)))
			}
		}
		if o.Scale != 100 {
			vcall(ps, psSetScale, uintptr(math.Float64bits(float64(o.Scale)/100)))
		}
	}
	if ps2 := comQuery(ps, &iidCoreWebView2PrintSet2); ps2 != 0 {
		if o.Pages != "" {
			vcall(ps2, ps2SetRanges, uintptr(unsafe.Pointer(utf16Ptr(o.Pages))))
		}
		if !forPDF {
			vcall(ps2, ps2SetCopies, uintptr(o.Copies))
			if o.Copies > 1 {
				vcall(ps2, ps2SetCollate, 1)
			}
			vcall(ps2, ps2SetColor, uintptr(printColorMode(o)))
			vcall(ps2, ps2SetDuplex, uintptr(printDuplexMode(o)))
			if o.Printer != "" {
				vcall(ps2, ps2SetPrinter, uintptr(unsafe.Pointer(utf16Ptr(o.Printer))))
			}
		}
		releaseCOM(ps2)
	}
	return ps
}

func printFailed(reason string) {
	printBusy = false
	postToPage(map[string]interface{}{"type": "print-done", "ok": false, "error": reason})
}

// runDirectPrint prints the current page with the chosen options.
func runDirectPrint(raw []byte) {
	defer recoverOptional("print")
	if printBusy {
		return
	}
	o, ok := decodePrintOptions(raw)
	if !ok {
		printFailed("The print options could not be read.")
		return
	}
	o, err := sanitizePrintOptions(o, installedPrinters())
	if err != nil {
		printFailed(err.Error())
		return
	}
	if webView16 == 0 {
		printFailed("Direct printing needs a newer Microsoft Edge WebView2 Runtime. Use More settings instead.")
		return
	}
	ps := newPrintSettings(o, false)
	if ps == 0 {
		printFailed("Direct printing is not available. Use More settings instead.")
		return
	}
	defer releaseCOM(ps)
	if hPrintDone == nil {
		hPrintDone = newHandler(func(this, hr, status uintptr) uintptr {
			printBusy = false
			ok := hrOK(hr) && int32(status) == 0
			reason := ""
			switch {
			case ok:
			case int32(status) == 1:
				reason = "The printer is not available. Check that it is on and connected."
			default:
				reason = "The page could not be printed."
			}
			postToPage(map[string]interface{}{"type": "print-done", "ok": ok, "error": reason})
			return 0
		})
	}
	printBusy = true
	if !hrOK(vcall(webView16, wv16Print, ps, hPrintDone.ptr())) {
		printFailed("The page could not be sent to the printer.")
	}
}

// runPrintToPdf saves the current page as a PDF file the user chooses.
func runPrintToPdf(raw []byte) {
	defer recoverOptional("save as PDF")
	if printBusy {
		return
	}
	o, ok := decodePrintOptions(raw)
	if !ok {
		printFailed("The PDF options could not be read.")
		return
	}
	o, err := sanitizePrintOptions(o, nil)
	if err != nil {
		printFailed(err.Error())
		return
	}
	if webView7 == 0 {
		printFailed("Saving as PDF needs a newer Microsoft Edge WebView2 Runtime.")
		return
	}
	docs := filepath.Join(os.Getenv("USERPROFILE"), "Documents")
	path, chosen := askSavePath(filepath.Join(docs, o.FileName))
	if !chosen {
		postToPage(map[string]interface{}{"type": "print-done", "ok": false, "cancelled": true})
		return
	}
	ps := newPrintSettings(o, true)
	defer releaseCOM(ps) // releaseCOM ignores 0 (default settings)
	if hPdfDone == nil {
		hPdfDone = newHandler(func(this, hr, success uintptr) uintptr {
			printBusy = false
			p := pdfPendingPath
			pdfPendingPath = ""
			st, err := os.Stat(p)
			if !hrOK(hr) || success == 0 || err != nil || st.Size() == 0 {
				postToPage(map[string]interface{}{"type": "download-failed", "name": filepath.Base(p), "reason": "The PDF could not be saved. Choose another folder and try again."})
				postToPage(map[string]interface{}{"type": "print-done", "ok": false, "pdf": true})
				return 0
			}
			pdfSeq++
			id := fmt.Sprintf("p%d", pdfSeq)
			completedFiles[id] = p
			postToPage(map[string]interface{}{"type": "print-done", "ok": true, "pdf": true})
			postToPage(map[string]interface{}{"type": "download-complete", "id": id, "name": filepath.Base(p), "folder": filepath.Base(filepath.Dir(p)), "size": st.Size()})
			return 0
		})
	}
	printBusy = true
	pdfPendingPath = path
	settings.LastSaveDir = filepath.Dir(path)
	saveSettings()
	if !hrOK(vcall(webView7, wv7PrintToPdf, uintptr(unsafe.Pointer(utf16Ptr(path))), ps, hPdfDone.ptr())) {
		pdfPendingPath = ""
		printFailed("The PDF could not be saved.")
	}
}
