package main

import (
	"net/url"
	"strings"
)

// Microsoft Store edition: pages of triplem.vip that may open inside the app.
// The workspace itself ("/"), its files ("/Assets/", except the direct-download
// installer) and the Store edition pages ("/windows-store/"). Every other page
// of the website is replaced by the matching Store edition page, so the Store
// app only ever shows content written for the Store edition.
const storeHomePath = "/windows-store/"

// productStoreURL opens this product in the Microsoft Store app (updates, ratings).
const productStoreURL = "ms-windows-store://pdp/?ProductId=9MV028GH5NPX"

func storeEditionActive(packaged bool) bool { return appEdition == "store" || packaged }

// storeNavigationRedirect returns where an in-app navigation must go instead,
// or ok=false when the navigation may proceed unchanged.
func storeNavigationRedirect(raw string) (string, bool) {
	if !isTrustedAppSource(raw) {
		return "", false // other sites are already opened in the browser
	}
	u, err := url.Parse(raw)
	if err != nil {
		return appOrigin + storeHomePath, true
	}
	p := u.EscapedPath()
	if p == "" {
		p = "/"
	}
	switch {
	case p == "/" || p == "/index.html":
		return "", false
	case p == "/windows-store" || strings.HasPrefix(p, storeHomePath):
		if strings.Contains(p, "..") {
			return appOrigin + storeHomePath, true
		}
		return "", false
	case strings.HasPrefix(p, "/Assets/mobile_app/"):
		return appOrigin + storeHomePath + "#updates", true
	case strings.HasPrefix(p, "/Assets/") && !strings.Contains(p, ".."):
		return "", false
	}
	lp := strings.ToLower(p)
	switch {
	case strings.Contains(lp, "privacy"):
		return appOrigin + storeHomePath + "privacy.html", true
	case strings.Contains(lp, "terms"):
		return appOrigin + storeHomePath + "terms.html", true
	case strings.Contains(lp, "trial"):
		return appOrigin + storeHomePath + "trial-terms.html", true
	case strings.Contains(lp, "ai-"), strings.Contains(lp, "/ai"):
		return appOrigin + storeHomePath + "ai.html", true
	}
	return appOrigin + storeHomePath, true
}
