//go:build windows

package main

import (
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"syscall"
	"unsafe"
)

// Minimal HTTPS GET over Windows' own WinHTTP stack (used by the updater).
// WinHTTP uses the Windows certificate store and the system/corporate proxy
// settings, and keeps the app small (no TLS stack compiled in). Redirects are
// not followed: update files are only ever read from https://triplem.vip/.

var (
	winhttp                      = syscall.NewLazyDLL("winhttp.dll")
	procWinHttpOpen              = winhttp.NewProc("WinHttpOpen")
	procWinHttpConnect           = winhttp.NewProc("WinHttpConnect")
	procWinHttpOpenRequest       = winhttp.NewProc("WinHttpOpenRequest")
	procWinHttpSendRequest       = winhttp.NewProc("WinHttpSendRequest")
	procWinHttpReceiveResponse   = winhttp.NewProc("WinHttpReceiveResponse")
	procWinHttpQueryHeaders      = winhttp.NewProc("WinHttpQueryHeaders")
	procWinHttpReadData          = winhttp.NewProc("WinHttpReadData")
	procWinHttpCloseHandle       = winhttp.NewProc("WinHttpCloseHandle")
	procWinHttpSetOption         = winhttp.NewProc("WinHttpSetOption")
	procWinHttpSetTimeouts       = winhttp.NewProc("WinHttpSetTimeouts")
	procWinHttpAddRequestHeaders = winhttp.NewProc("WinHttpAddRequestHeaders")
)

const (
	winhttpAccessAutomaticProxy = 4 // Windows 8.1+
	winhttpAccessDefaultProxy   = 0
	winhttpFlagSecure           = 0x00800000
	winhttpFlagRefresh          = 0x00000100
	winhttpQueryStatusCode      = 19
	winhttpQueryFlagNumber      = 0x20000000
	winhttpOptionRedirectPolicy = 88
	winhttpRedirectPolicyNever  = 0
	winhttpAddReqReplace        = 0x80000000 | 0x20000000 // REPLACE | ADD
)

// httpsGet streams the body of an HTTPS GET to w (at most limit bytes) and
// returns the HTTP status code.
func httpsGet(raw string, limit int64, w io.Writer) (int, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return 0, errors.New("invalid URL")
	}
	agent := utf16Ptr(updateUserAgentProto + appVersionNative)
	session, _, _ := procWinHttpOpen.Call(uintptr(unsafe.Pointer(agent)), winhttpAccessAutomaticProxy, 0, 0, 0)
	if session == 0 {
		session, _, _ = procWinHttpOpen.Call(uintptr(unsafe.Pointer(agent)), winhttpAccessDefaultProxy, 0, 0, 0)
	}
	if session == 0 {
		return 0, errors.New("WinHTTP unavailable")
	}
	defer procWinHttpCloseHandle.Call(session)
	// resolve, connect, send, receive (milliseconds)
	procWinHttpSetTimeouts.Call(session, 15000, 15000, 30000, 60000)

	conn, _, _ := procWinHttpConnect.Call(session, uintptr(unsafe.Pointer(utf16Ptr(u.Hostname()))), 443, 0)
	if conn == 0 {
		return 0, errors.New("connection failed")
	}
	defer procWinHttpCloseHandle.Call(conn)
	path := u.EscapedPath()
	if u.RawQuery != "" {
		path += "?" + u.RawQuery
	}
	req, _, _ := procWinHttpOpenRequest.Call(conn, uintptr(unsafe.Pointer(utf16Ptr("GET"))), uintptr(unsafe.Pointer(utf16Ptr(path))), 0, 0, 0, winhttpFlagSecure|winhttpFlagRefresh)
	if req == 0 {
		return 0, errors.New("request failed")
	}
	defer procWinHttpCloseHandle.Call(req)
	policy := uint32(winhttpRedirectPolicyNever)
	procWinHttpSetOption.Call(req, winhttpOptionRedirectPolicy, uintptr(unsafe.Pointer(&policy)), 4)
	hdr := "Cache-Control: no-cache\r\n"
	procWinHttpAddRequestHeaders.Call(req, uintptr(unsafe.Pointer(utf16Ptr(hdr))), uintptr(len(hdr)), winhttpAddReqReplace)

	if r, _, e := procWinHttpSendRequest.Call(req, 0, 0, 0, 0, 0, 0); r == 0 {
		return 0, fmt.Errorf("send failed: %v", e)
	}
	if r, _, e := procWinHttpReceiveResponse.Call(req, 0); r == 0 {
		return 0, fmt.Errorf("no response: %v", e)
	}
	var status, size uint32 = 0, 4
	procWinHttpQueryHeaders.Call(req, winhttpQueryStatusCode|winhttpQueryFlagNumber, 0, uintptr(unsafe.Pointer(&status)), uintptr(unsafe.Pointer(&size)), 0)
	if status != 200 {
		return int(status), nil
	}
	buf := make([]byte, 64*1024)
	var total int64
	for {
		var n uint32
		if r, _, e := procWinHttpReadData.Call(req, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), uintptr(unsafe.Pointer(&n))); r == 0 {
			return int(status), fmt.Errorf("read failed: %v", e)
		}
		if n == 0 {
			break
		}
		total += int64(n)
		if total > limit {
			return int(status), errors.New("response larger than expected")
		}
		if _, err := w.Write(buf[:n]); err != nil {
			return int(status), err
		}
	}
	return int(status), nil
}

func isTriplemHTTPS(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && strings.EqualFold(u.Hostname(), "triplem.vip") && u.Port() == ""
}
