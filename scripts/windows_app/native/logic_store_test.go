package main

import "testing"

func TestStoreNavigationKeepsWorkspaceAndStorePages(t *testing.T) {
	keep := []string{
		"https://triplem.vip/", "https://triplem.vip/index.html", "https://triplem.vip/?open=reports#x",
		"https://triplem.vip/windows-store/", "https://triplem.vip/windows-store/terms.html",
		"https://triplem.vip/Assets/logo/logo.png", "https://www.triplem.vip/",
		"https://example.com/anything", // other sites are handled (opened in the browser) elsewhere
	}
	for _, u := range keep {
		if got, redirect := storeNavigationRedirect(u); redirect {
			t.Fatalf("%s should stay, redirected to %s", u, got)
		}
	}
}

func TestStoreNavigationReplacesOtherWebsitePages(t *testing.T) {
	cases := map[string]string{
		"https://triplem.vip/seo/privacy-policy.html":                    appOrigin + "/windows-store/privacy.html",
		"https://triplem.vip/seo/terms-and-conditions.html":              appOrigin + "/windows-store/terms.html",
		"https://triplem.vip/Demo/":                                      appOrigin + "/windows-store/",
		"https://triplem.vip/Founder/":                                   appOrigin + "/windows-store/",
		"https://triplem.vip/regions/global.html":                        appOrigin + "/windows-store/",
		"https://triplem.vip/llms.txt":                                   appOrigin + "/windows-store/",
		"https://triplem.vip/Assets/mobile_app/Windows/TriplemVIP_Setup.exe": appOrigin + "/windows-store/#updates",
		"https://triplem.vip/windows-store/../Demo/":                     appOrigin + "/windows-store/",
	}
	for in, want := range cases {
		got, redirect := storeNavigationRedirect(in)
		if !redirect || got != want {
			t.Fatalf("%s: got %q (%v), want %q", in, got, redirect, want)
		}
	}
}

func TestStorePageLinkIsTheOnlyStoreSchemeAllowed(t *testing.T) {
	if !externalOpenAllowed(productStoreURL) {
		t.Fatal("this product's Store page must open")
	}
	if externalOpenAllowed("ms-windows-store://pdp/?ProductId=9NOTOURS") || externalOpenAllowed("ms-windows-store://downloadsandupdates") {
		t.Fatal("other Store pages must not open")
	}
	if !storeEditionActive(true) {
		t.Fatal("a packaged install is always the Store edition")
	}
}
