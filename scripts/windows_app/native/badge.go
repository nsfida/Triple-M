package main

// Pure-Go renderer for the taskbar unread badge (overlay icon). It produces a
// straight-alpha BGRA bitmap (top-down rows) that the Windows layer turns into
// an HICON. Anti-aliasing uses 4x4 supersampling.

// 3x5 glyphs, rows top to bottom, bit 2 = left column.
var badgeGlyphs = map[rune][5]uint8{
	'0': {7, 5, 5, 5, 7},
	'1': {2, 6, 2, 2, 7},
	'2': {7, 1, 7, 4, 7},
	'3': {7, 1, 7, 1, 7},
	'4': {5, 5, 7, 1, 1},
	'5': {7, 4, 7, 1, 7},
	'6': {7, 4, 7, 5, 7},
	'7': {7, 1, 2, 2, 2},
	'8': {7, 5, 7, 5, 7},
	'9': {7, 5, 7, 1, 7},
	'+': {0, 2, 7, 2, 0},
}

type badgeBitmap struct {
	Size int
	Pix  []uint32 // 0xAARRGGBB, straight alpha, row-major top-down
}

const (
	badgeColorFill   = uint32(0xE5484D) // Triplem alert red
	badgeColorBorder = uint32(0xFFFFFF)
	badgeColorText   = uint32(0xFFFFFF)
)

func renderBadge(size int, text string) badgeBitmap {
	if size < 8 {
		size = 8
	}
	bm := badgeBitmap{Size: size, Pix: make([]uint32, size*size)}
	if text == "" {
		return bm
	}
	runes := []rune(text)
	// Glyph layout in "glyph units": each glyph 3 wide, 1 unit spacing, 5 tall.
	unitsW := float64(len(runes)*3 + (len(runes) - 1))
	unitsH := 5.0
	fs := float64(size)
	scale := (fs * 0.56) / unitsH
	if unitsW*scale > fs*0.66 {
		scale = (fs * 0.66) / unitsW
	}
	textW := unitsW * scale
	textH := unitsH * scale
	ox := (fs - textW) / 2
	oy := (fs - textH) / 2
	cx, cy := fs/2, fs/2
	rOuter := fs / 2
	rInner := rOuter - maxF(1, fs/16)

	const ss = 4
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var aOuter, aInner, aText float64
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					px := float64(x) + (float64(sx)+0.5)/ss
					py := float64(y) + (float64(sy)+0.5)/ss
					dx, dy := px-cx, py-cy
					d2 := dx*dx + dy*dy
					if d2 <= rOuter*rOuter {
						aOuter++
					}
					if d2 <= rInner*rInner {
						aInner++
						gx := (px - ox) / scale
						gy := (py - oy) / scale
						if gx >= 0 && gy >= 0 && gy < 5 {
							gi := int(gx) / 4
							col := int(gx) % 4
							row := int(gy)
							if gi < len(runes) && col < 3 {
								if g, ok := badgeGlyphs[runes[gi]]; ok && g[row]&(4>>uint(col)) != 0 {
									aText++
								}
							}
						}
					}
				}
			}
			n := float64(ss * ss)
			aOuter /= n
			aInner /= n
			aText /= n
			if aOuter <= 0 {
				continue
			}
			// Composite: border (white) under fill (red) under text (white).
			col := blend(badgeColorBorder, badgeColorFill, aInner/aOuter)
			if aInner > 0 {
				col = blend(col, badgeColorText, aText/aInner)
			}
			a := uint32(aOuter*255 + 0.5)
			bm.Pix[y*size+x] = a<<24 | col
		}
	}
	return bm
}

func blend(a, b uint32, t float64) uint32 {
	if t <= 0 {
		return a
	}
	if t >= 1 {
		return b
	}
	ch := func(shift uint) uint32 {
		ca := float64((a >> shift) & 0xFF)
		cb := float64((b >> shift) & 0xFF)
		return uint32(ca+(cb-ca)*t+0.5) & 0xFF
	}
	return ch(16)<<16 | ch(8)<<8 | ch(0)
}

func maxF(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
