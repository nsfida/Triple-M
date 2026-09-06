/* Triplem VIP unified Account Security — verified recovery, trusted 2FA browsers, biometric quick sign-in, Smart PIN integration and session history (v131). */
(() => {
  "use strict";

  const safe = v => String(v ?? "");
  const esc = v => (typeof window.escapeHtml === "function" ? window.escapeHtml(safe(v)) : safe(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"));
  const TRUSTED_2FA_PREFIX = "triplem.vip.2fa-trusted.v1:";
  const QUICK_SIGNIN_LOCAL = "triplem.vip.biometric-quick-signin.v1";
  let recoveryApprovalPoll = null;
  let approvalModalRequestId = "";

  function rpc(name, args = {}) {
    if (typeof window.supabaseRpc !== "function") throw new Error("Secure database connection is unavailable.");
    return window.supabaseRpc(name, args);
  }
  function user() {
    try { if (typeof state !== "undefined" && state?.sessionUser) return state.sessionUser; } catch (_) {}
    return window.state?.sessionUser || null;
  }
  function normalizedUsername(value = user()?.username) { return safe(value).trim().toLowerCase(); }
  function twoFactorKey(username) { const u = normalizedUsername(username); return u ? TRUSTED_2FA_PREFIX + u : ""; }
  function readTrusted2fa(username) {
    const key = twoFactorKey(username); if (!key) return null;
    try { const x = JSON.parse(localStorage.getItem(key) || "null"); return x && safe(x.secret).length >= 32 ? x : null; } catch (_) { return null; }
  }
  function writeTrusted2fa(username, secret, label, expiresAt = "") {
    const key = twoFactorKey(username); if (!key) return;
    try { localStorage.setItem(key, JSON.stringify({ secret:safe(secret), label:safe(label), expiresAt:safe(expiresAt), savedAt:new Date().toISOString() })); } catch (_) {}
  }
  function clearTrusted2fa(username) { const key=twoFactorKey(username); if (key) try { localStorage.removeItem(key); } catch (_) {} }
  function randomSecret() {
    const b = new Uint8Array(32); crypto.getRandomValues(b); let s=""; for (const n of b) s += String.fromCharCode(n);
    return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }
  function deviceLabel() { return window.TriplemAccountRecovery?.browserDeviceLabel?.() || "This browser"; }
  function recoveryLocal(uid = user()?.id) { return window.TriplemAccountRecovery?.readTrustedDevice?.(uid) || null; }
  function writeRecoveryLocal(secret,label,uid=user()?.id) { try { window.TriplemAccountRecovery?.writeTrustedDevice?.(secret,label,uid); } catch (_) {} }
  function formatDate(value) { if (!value) return ""; try { return new Date(value).toLocaleString(); } catch (_) { return safe(value); } }
  function closeModal(modal) {
    if (!modal) return;
    if (window.TriplemAuthSurface?.isHost?.(modal)) {
      window.TriplemAuthSurface.reset({ keepVisible: true });
      return;
    }
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden","true");
  }
  function showModal(modal) {
    if (window.TriplemAuthSurface?.isHost?.(modal)) return;
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden","false");
  }
  function ensureModal(id, className="") {
    let modal=document.getElementById(id);
    if (!modal) { modal=document.createElement("div"); modal.id=id; modal.className=`modal hide ${className}`.trim(); modal.setAttribute("aria-hidden","true"); document.body.appendChild(modal); }
    return modal;
  }
  function setError(root,id,msg) { const e=root?.querySelector?.(`#${id}`); if (!e) return; e.textContent=safe(msg); e.classList.toggle("show",!!msg); }
  function passwordPolicy(value) {
    if (typeof window.assertPasswordPolicy === "function") return window.assertPasswordPolicy(value,"New password");
    const p=safe(value); if (p.length<8 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p)) throw new Error("Use at least 8 characters with one uppercase letter, one lowercase letter, and one number.");
  }

  async function promptCurrentPassword(title="Confirm your password", copy="Enter your current password to confirm this security change.") {
    const modal=ensureModal("accountSecurityPasswordPrompt","account-security-password-prompt");
    return new Promise(resolve => {
      let done=false;
      const finish=v=>{ if(done)return;done=true;closeModal(modal);resolve(v); };
      modal.innerHTML=`<div class="modal-backdrop" data-security-pw-cancel></div><div class="modal-dialog account-security-mini-dialog" role="dialog" aria-modal="true"><div class="settings-sheet-head"><div><p class="account-security-kicker">Identity check</p><h3>${esc(title)}</h3><p>${esc(copy)}</p></div><button class="btn ghost tiny" type="button" data-security-pw-cancel aria-label="Close">✕</button></div><div class="modal-body settings-sheet-body"><label class="settings-field">Current password<input id="accountSecurityCurrentPassword" class="input settings-input" type="password" autocomplete="current-password"></label><p class="lock-error" id="accountSecurityPasswordError"></p><div class="settings-sheet-footer"><button class="btn ghost" type="button" data-security-pw-cancel>Cancel</button><button class="btn primary" type="button" id="accountSecurityPasswordContinue">Continue</button></div></div></div>`;
      modal.querySelectorAll("[data-security-pw-cancel]").forEach(x=>x.onclick=()=>finish(""));
      const input=modal.querySelector("#accountSecurityCurrentPassword");
      const submit=()=>{ const v=safe(input?.value); if(!v){setError(modal,"accountSecurityPasswordError","Enter your current password.");return;} finish(v); };
      modal.querySelector("#accountSecurityPasswordContinue").onclick=submit;
      input?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();submit();}});
      showModal(modal); setTimeout(()=>input?.focus(),60);
    });
  }

  async function attemptTrustedTwoFactorLogin({ challengeToken="", username="" }={}) {
    const local=readTrusted2fa(username); if (!local?.secret) return null;
    try {
      const result=await rpc("app_two_factor_complete_trusted_login",{p_challenge_token:challengeToken,p_device_secret:local.secret});
      if (result?.ok && result?.session_token && result?.user?.id) return result;
      if (/unavailable|expired|not enabled/i.test(safe(result?.error))) clearTrusted2fa(username);
    } catch (_) {}
    return null;
  }

  async function enrollTrustedBrowserAfterTwoFactor({ password="", username="", user:sessionUser=null, requested=false }={}) {
    if (!requested || !password || !sessionUser?.id || sessionUser?.must_change_password) return false;
    const existingRecovery=recoveryLocal(sessionUser.id);
    const existingTwoFactor=readTrusted2fa(username||sessionUser.username);
    const secret=existingRecovery?.secret || existingTwoFactor?.secret || randomSecret();
    const label=existingRecovery?.label || existingTwoFactor?.label || deviceLabel(); let twoFactor=null;
    try {
      twoFactor=await rpc("app_two_factor_trust_device",{p_password:password,p_device_secret:secret,p_label:label,p_user_agent:navigator.userAgent||"",p_days:30});
      if (!twoFactor?.ok) return false;
      writeTrusted2fa(username||sessionUser.username,secret,label,twoFactor.expires_at||"");
      try {
        await rpc("app_account_recovery_trust_device",{p_password:password,p_device_secret:secret,p_label:label,p_user_agent:navigator.userAgent||""});
        writeRecoveryLocal(secret,label,sessionUser.id);
      } catch (err) { console.warn("Recovery approval enrollment was not completed.",err); }
      return true;
    } catch (err) { console.warn("Trusted browser enrollment failed.",err); return false; }
  }

  async function tagCurrentSession(method) { try { await rpc("app_account_security_tag_current_session",{p_auth_method:method}); } catch (_) {} }

  function passkeyApi() {
    const api=window.TriplemAccountRecovery;
    if (!api?.getPasskeyProof || !api?.createPasskeyProof) throw new Error("Passkey recovery module is unavailable. Refresh and try again.");
    return api;
  }

  const STANDARD_WEBAUTHN_FUNCTION = "account-security-webauthn";
  function webauthnSupported() {
    return !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials && crypto?.subtle);
  }
  function bytesToBase64Url(value) {
    const bytes=value instanceof Uint8Array?value:new Uint8Array(value||0); let binary="";
    for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }
  function base64UrlToBytes(value) {
    const raw=safe(value).trim(), padded=raw.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-raw.length%4)%4);
    const binary=atob(padded), out=new Uint8Array(binary.length); for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i); return out;
  }
  function standardPasskeyLabel(){return `Passkey · ${deviceLabel()}`.slice(0,80);}
  function webauthnConfig(){
    if(typeof window.getSupabaseConfig!=="function")throw new Error("Supabase configuration is unavailable.");
    const cfg=window.getSupabaseConfig(),base=safe(cfg?.supabaseUrl).replace(/\/$/,""),key=safe(cfg?.supabaseKey).trim();
    if(!base||!key)throw new Error("Supabase configuration is unavailable."); return{base,key};
  }
  async function invokeStandardWebAuthn(action,payload={},authenticated=true){
    const{base,key}=webauthnConfig(); const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};
    let token=""; try{token=safe(typeof state!=="undefined"?state?.sessionToken:window.state?.sessionToken).trim();}catch(_){}
    if(authenticated){if(!token)throw new Error("Authentication required.");headers["X-Session-Token"]=token;}
    const response=await fetch(`${base}/functions/v1/${STANDARD_WEBAUTHN_FUNCTION}`,{method:"POST",headers,body:JSON.stringify({action,...payload}),cache:"no-store"});
    const text=await response.text();let data=null;try{data=text?JSON.parse(text):null;}catch(_){}
    if(!response.ok||data?.ok===false)throw new Error(data?.error||`Biometric service request failed (${response.status}).`); return data||{};
  }
  function standardAssertionPayload(assertion){
    if(!assertion?.rawId||!assertion?.response?.clientDataJSON||!assertion?.response?.authenticatorData||!assertion?.response?.signature)throw new Error("The selected passkey did not return a complete verification response.");
    return{credentialId:bytesToBase64Url(assertion.rawId),clientDataJSON:bytesToBase64Url(assertion.response.clientDataJSON),authenticatorData:bytesToBase64Url(assertion.response.authenticatorData),signature:bytesToBase64Url(assertion.response.signature)};
  }
  async function createStandardSecurityPasskey(password,{quick=true,bypass=false}={}){
    if(!webauthnSupported())throw new Error("Face ID, Touch ID, Windows Hello or Passkeys require a secure HTTPS browser with WebAuthn support.");
    const begin=await invokeStandardWebAuthn("register-begin",{password:safe(password)}); if(!begin?.challenge_token||!begin?.challenge||!begin?.rp_id)throw new Error("Biometric setup could not start.");
    const credential=await navigator.credentials.create({publicKey:{
      challenge:base64UrlToBytes(begin.challenge),rp:{name:"Triplem VIP",id:begin.rp_id},
      user:{id:new TextEncoder().encode(safe(begin.user_id)),name:safe(begin.username),displayName:safe(begin.display_name||begin.username)},
      pubKeyCredParams:[{type:"public-key",alg:-7}],timeout:90000,
      authenticatorSelection:{residentKey:"required",requireResidentKey:true,userVerification:"required"},attestation:"none"
    }});
    if(!credential)throw new Error("Biometric passkey setup was cancelled.");
    const response=credential.response,publicKey=response?.getPublicKey?.(),algorithm=Number(response?.getPublicKeyAlgorithm?.());
    if(!publicKey||![-7,-257].includes(algorithm))throw new Error("This browser created a passkey but cannot expose the standard public-key data required for secure sign-in. Update the browser and try again.");
    const completed=await invokeStandardWebAuthn("register-complete",{
      challengeToken:begin.challenge_token,credentialId:bytesToBase64Url(credential.rawId),clientDataJSON:bytesToBase64Url(response.clientDataJSON),
      publicKeySpki:bytesToBase64Url(publicKey),algorithm,label:standardPasskeyLabel(),quickSignIn:quick===true,smartPinBypass:bypass===true
    });
    setQuickSignInLocal(quick===true);
    const u=user();if(u?.settings){u.settings.security_biometric_quick_sign_in=quick===true;u.settings.security_biometric_smart_pin_bypass=bypass===true;}
    return completed;
  }
  async function setStandardBiometricPreferences(password,quick,bypass){
    const result=await rpc("app_account_security_set_standard_biometric_preferences",{p_password:password,p_quick_sign_in:quick===true,p_smart_pin_bypass:bypass===true});
    if(result?.ok===false)throw new Error(result.error||"Could not update biometric settings.");
    setQuickSignInLocal(quick===true);const u=user();if(u?.settings){u.settings.security_biometric_quick_sign_in=quick===true;u.settings.security_biometric_smart_pin_bypass=bypass===true;}return result;
  }

  function quickSignInLocalEnabled() { try { return localStorage.getItem(QUICK_SIGNIN_LOCAL)==="1"; } catch (_) { return false; } }
  function setQuickSignInLocal(enabled) { try { enabled ? localStorage.setItem(QUICK_SIGNIN_LOCAL,"1") : localStorage.removeItem(QUICK_SIGNIN_LOCAL); } catch (_) {} updateQuickSignInButton(); }

  async function performBiometricQuickSignIn() {
    const btn=document.getElementById("biometricQuickSignInBtn"),err=document.getElementById("lockError");
    if(btn)btn.disabled=true;if(err){err.textContent="";err.classList.remove("show");}
    try{
      if(!webauthnSupported())throw new Error("Passkey Quick Sign-In is not supported by this browser.");
      const begin=await invokeStandardWebAuthn("quick-signin-begin",{},false);if(!begin?.challenge_token||!begin?.challenge)throw new Error("Biometric sign-in could not start.");
      const assertion=await navigator.credentials.get({publicKey:{challenge:base64UrlToBytes(begin.challenge),rpId:begin.rp_id,timeout:90000,userVerification:"required"}});
      const remember=typeof window.readRememberMePreference==="function"?!!window.readRememberMePreference():!!document.getElementById("rememberMeCheckbox")?.checked;
      const result=await invokeStandardWebAuthn("quick-signin-complete",{challengeToken:begin.challenge_token,...standardAssertionPayload(assertion),userAgent:navigator.userAgent||"",remember},false);
      if(!result?.session_token||!result?.user?.id)throw new Error("Biometric sign-in could not be completed.");
      try{if(typeof state!=="undefined")state.sessionToken=result.session_token;}catch(_){}
      if(typeof window.completeAuthenticatedUnlock!=="function")throw new Error("Sign-in module is unavailable. Refresh and try again.");
      const ok=await window.completeAuthenticatedUnlock(result.user,result.session_token,{remember,silentResume:false,biometricVerified:true});if(!ok)throw new Error("Sign-in was cancelled.");
    }catch(e){if(err){err.textContent=e?.message||"Biometric sign-in failed.";err.classList.add("show");}}
    finally{if(btn?.isConnected)btn.disabled=false;}
  }

  function updateQuickSignInButton(){const btn=document.getElementById("biometricQuickSignInBtn");if(!btn)return;btn.classList.toggle("hide",!quickSignInLocalEnabled()||!webauthnSupported());}
  function installQuickSignInButton(){
    if(document.getElementById("biometricQuickSignInBtn")){updateQuickSignInButton();return;}
    const signIn=document.getElementById("unlockBtn");if(!signIn)return;
    const btn=document.createElement("button");btn.id="biometricQuickSignInBtn";btn.type="button";btn.className="btn biometric-quick-signin-btn hide";
    btn.innerHTML='<i class="fa-solid fa-fingerprint" aria-hidden="true"></i><span>Face ID / Passkey</span><small>Quick sign-in</small>';
    btn.addEventListener("click",performBiometricQuickSignIn);signIn.insertAdjacentElement("afterend",btn);updateQuickSignInButton();
  }

  async function tryBiometricWorkspaceUnlock(){
    const u=user(),settings=u?.settings||{};if(!u?.id||settings.security_biometric_smart_pin_bypass!==true||!webauthnSupported())return false;
    try{
      const begin=await invokeStandardWebAuthn("workspace-begin",{},true);if(!begin?.challenge_token||!begin?.challenge)return false;
      const allow=(Array.isArray(begin.allow_credentials)?begin.allow_credentials:[]).map(id=>({type:"public-key",id:base64UrlToBytes(id)}));
      const assertion=await navigator.credentials.get({publicKey:{challenge:base64UrlToBytes(begin.challenge),rpId:begin.rp_id,timeout:60000,userVerification:"required",allowCredentials:allow}});
      const result=await invokeStandardWebAuthn("workspace-complete",{challengeToken:begin.challenge_token,...standardAssertionPayload(assertion)},true);return !!result?.verified;
    }catch(_){return false;}
  }

  // ── Recovery flow: username -> registered identity -> configured methods ──
  function recoveryModal() {
    const inline = window.TriplemAuthSurface?.beginRecovery?.();
    return inline || ensureModal("unifiedPasswordRecoveryModal","account-recovery-modal unified-recovery-modal");
  }
  function recoveryShell(title,subtitle,body) {
    if (window.TriplemAuthSurface?.isActive?.("recovery")) {
      return window.TriplemAuthSurface.recoveryShell(esc(title), esc(subtitle), body);
    }
    return `<div class="modal-backdrop" data-sec-recovery-close></div><div class="modal-dialog settings-sheet account-recovery-dialog unified-recovery-dialog" role="dialog" aria-modal="true"><div class="settings-sheet-head recovery-hero-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-life-ring"></i> Account recovery</p><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><button class="btn ghost tiny" type="button" data-sec-recovery-close aria-label="Close">✕</button></div><div class="modal-body settings-sheet-body account-recovery-body unified-recovery-body">${body}</div></div>`;
  }
  function bindRecoveryClose(modal, backHandler = null) {
    modal.querySelectorAll("[data-sec-recovery-close]").forEach(x=>x.onclick=()=>closeModal(modal));
    if (window.TriplemAuthSurface?.isHost?.(modal)) {
      window.TriplemAuthSurface.bindBack(modal, backHandler || (()=>closeModal(modal)));
      window.TriplemAuthSurface.enhancePasswords?.(modal);
    }
  }
  function recoverySuccess(modal,title) {
    modal.innerHTML=recoveryShell(title,"Your password has been replaced securely.",`<div class="account-recovery-success"><span><i class="fa-solid fa-circle-check"></i></span><h4>${esc(title)}</h4><p>Existing sessions were revoked. Sign in again with your new password.</p></div><div class="settings-sheet-footer"><button class="btn primary" id="verifiedRecoveryDone" type="button">Return to sign in</button></div>`); bindRecoveryClose(modal, ()=>closeModal(modal)); modal.querySelector("#verifiedRecoveryDone").onclick=()=>closeModal(modal);
  }
  function openVerifiedRecovery(preset="") {
    const modal=recoveryModal();
    renderRecoveryUsername(modal,preset||document.getElementById("zipUsernameInput")?.value||""); showModal(modal);
  }
  function renderRecoveryUsername(modal,preset="") {
    modal.innerHTML=recoveryShell("Forgot Password","First confirm the account username. Triplem VIP will not disclose recovery methods at this stage.",`<div class="account-recovery-security-note"><i class="fa-solid fa-shield-halved"></i><div><strong>Private recovery verification</strong><span>Your configured recovery methods remain hidden until your registered account details match.</span></div></div><label class="settings-field">Username<input id="verifiedRecoveryUsername" class="input settings-input" autocomplete="username" value="${esc(safe(preset).trim())}" placeholder="Your username"></label><p class="lock-error" id="verifiedRecoveryError"></p><div class="settings-sheet-footer"><button class="btn ghost" type="button" data-sec-recovery-close>Cancel</button><button class="btn primary" id="verifiedRecoveryUsernameNext" type="button">Continue</button></div>`);
    bindRecoveryClose(modal, ()=>closeModal(modal)); const input=modal.querySelector("#verifiedRecoveryUsername");
    const next=()=>{const name=safe(input?.value).trim();if(!name){setError(modal,"verifiedRecoveryError","Enter your username.");return;}renderRecoveryIdentity(modal,name);};
    modal.querySelector("#verifiedRecoveryUsernameNext").onclick=next; input?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();next();}}); setTimeout(()=>input?.focus(),50);
  }
  function renderRecoveryIdentity(modal,username) {
    modal.innerHTML=recoveryShell("Verify registered details","These details must match the account registered under this username before recovery choices are disclosed.",`<div class="verified-recovery-identity"><label class="settings-field">Full name<input id="verifiedRecoveryName" class="input settings-input" autocomplete="name" placeholder="Registered full name"></label><label class="settings-field">Registered email<input id="verifiedRecoveryEmail" class="input settings-input" type="email" autocomplete="email" placeholder="Registered email address"></label><label class="settings-field">Registered mobile number<input id="verifiedRecoveryMobile" class="input settings-input" autocomplete="tel" inputmode="tel" placeholder="Registered mobile number"></label></div><p class="account-security-fineprint"><i class="fa-solid fa-lock"></i> All three values must match. No recovery method is revealed on a mismatch.</p><p class="lock-error" id="verifiedRecoveryIdentityError"></p><div class="settings-sheet-footer"><button class="btn ghost" id="verifiedRecoveryIdentityBack" type="button">Back</button><button class="btn primary" id="verifiedRecoveryIdentityVerify" type="button">Verify details</button></div>`);
    bindRecoveryClose(modal, ()=>renderRecoveryUsername(modal,username)); modal.querySelector("#verifiedRecoveryIdentityBack").onclick=()=>renderRecoveryUsername(modal,username);
    modal.querySelector("#verifiedRecoveryIdentityVerify").onclick=async e=>{
      const btn=e.currentTarget; setError(modal,"verifiedRecoveryIdentityError","");
      try { const full=safe(modal.querySelector("#verifiedRecoveryName")?.value).trim(), email=safe(modal.querySelector("#verifiedRecoveryEmail")?.value).trim(), mobile=safe(modal.querySelector("#verifiedRecoveryMobile")?.value).trim(); if(!full||!email||!mobile) throw new Error("Enter your registered full name, email address and mobile number."); btn.disabled=true;
        const result=await rpc("app_account_self_recovery_identity_verify",{p_username:username,p_email:email,p_mobile:mobile,p_full_name:full});
        if(!result?.ok || !result?.challenge_token) throw new Error("The supplied account details could not be verified.");
        renderRecoveryMethods(modal,{username,challengeToken:result.challenge_token,methods:Array.isArray(result.methods)?result.methods:[],protectedAccount:!!result.protected_account,displayName:result.display_name||username});
      } catch(err){setError(modal,"verifiedRecoveryIdentityError",err?.message||"The supplied account details could not be verified.");} finally {if(btn?.isConnected)btn.disabled=false;}
    };
  }
  const methodInfo={
    "2fa":["fa-mobile-screen-button","Authenticator App 2FA","Use the current authenticator code or one unused 2FA recovery code."],
    "passkey":["fa-fingerprint","Face ID / Passkey","Use the passkey you configured with Face ID, Touch ID, Windows Hello or device biometrics."],
    "key":["fa-key","Recovery Key","Use the high-entropy Triplem VIP Recovery Key saved offline."],
    "device":["fa-shield-halved","Trusted browser approval","Approve this reset from a browser previously trusted for your account."]
  };
  function renderRecoveryMethods(modal,ctx) {
    const cards=ctx.methods.map(m=>{const i=methodInfo[m];if(!i)return"";return `<button class="account-security-method-card" type="button" data-verified-recovery-method="${esc(m)}"><span><i class="fa-solid ${i[0]}"></i></span><div><strong>${esc(i[1])}</strong><small>${esc(i[2])}</small></div><i class="fa-solid fa-chevron-right"></i></button>`;}).join("");
    const fallback=ctx.protectedAccount ? `<div class="account-security-contact-card"><i class="fa-solid fa-database"></i><div><strong>Project Owner recovery</strong><small>The protected Main Admin cannot be reset by another administrator. Supabase project-owner recovery remains the final fallback.</small></div></div>` : `<button class="account-security-method-card" id="verifiedRecoveryAdmin" type="button"><span><i class="fa-solid fa-headset"></i></span><div><strong>Contact Administrator</strong><small>If none of your configured methods are available, request verified administrator assistance.</small></div><i class="fa-solid fa-chevron-right"></i></button>`;
    modal.innerHTML=recoveryShell("Choose your recovery method",`${ctx.displayName}, only recovery methods already configured for this account are shown.`,`<div class="account-security-method-grid">${cards || `<div class="account-security-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>No self-service method is configured</strong><small>Use the secure fallback below.</small></div>`}${fallback}</div><p class="lock-error" id="verifiedRecoveryMethodError"></p><div class="settings-sheet-footer"><button class="btn ghost" id="verifiedRecoveryMethodsBack" type="button">Back</button></div>`);
    bindRecoveryClose(modal, ()=>renderRecoveryUsername(modal,ctx.username)); modal.querySelector("#verifiedRecoveryMethodsBack").onclick=()=>renderRecoveryUsername(modal,ctx.username);
    modal.querySelectorAll("[data-verified-recovery-method]").forEach(b=>b.onclick=()=>startVerifiedMethod(modal,ctx,b.dataset.verifiedRecoveryMethod));
    modal.querySelector("#verifiedRecoveryAdmin")?.addEventListener("click",()=>renderAdminRecoveryHelp(modal,ctx));
  }
  function renderAdminRecoveryHelp(modal,ctx) {
    modal.innerHTML=recoveryShell("Contact Administrator","Administrator recovery remains available when self-service credentials are unavailable.",`<div class="account-security-contact-card is-large"><i class="fa-solid fa-headset"></i><div><strong>Triplem VIP Support</strong><small>Provide your username, registered full name, email and mobile number to the administrator. Never send your password, Recovery Key or Authenticator code.</small></div></div><div class="settings-sheet-footer"><button class="btn ghost" id="adminRecoveryBack" type="button">Back</button><a class="btn primary" href="https://triplem.vip/" target="_blank" rel="noopener">Open Triplem VIP</a></div>`); bindRecoveryClose(modal, ()=>renderRecoveryMethods(modal,ctx)); modal.querySelector("#adminRecoveryBack").onclick=()=>renderRecoveryMethods(modal,ctx);
  }
  function newPasswordFields(prefix) { return `<label class="settings-field">New password<input id="${prefix}New" class="input settings-input" type="password" autocomplete="new-password"></label><label class="settings-field">Confirm new password<input id="${prefix}Confirm" class="input settings-input" type="password" autocomplete="new-password"></label>`; }
  function readNewPassword(modal,prefix){const n=safe(modal.querySelector(`#${prefix}New`)?.value),c=safe(modal.querySelector(`#${prefix}Confirm`)?.value);passwordPolicy(n);if(n!==c)throw new Error("New passwords do not match.");return n;}
  function startVerifiedMethod(modal,ctx,method) { if(method==="key") return renderKeyRecovery(modal,ctx); if(method==="passkey") return renderPasskeyRecovery(modal,ctx); if(method==="device") return renderDeviceRecovery(modal,ctx); if(method==="2fa") return renderTwoFactorRecovery(modal,ctx); }
  function renderKeyRecovery(modal,ctx) {
    modal.innerHTML=recoveryShell("Recover with Recovery Key","Enter the Recovery Key you saved when you configured self-service recovery.",`<label class="settings-field">Recovery Key<input id="verifiedKeyValue" class="input settings-input recovery-key-input" autocomplete="off" spellcheck="false" placeholder="TVIP-RCV-…"></label>${newPasswordFields("verifiedKey")}<p class="lock-error" id="verifiedKeyError"></p><div class="settings-sheet-footer"><button class="btn ghost" id="verifiedKeyBack" type="button">Back</button><button class="btn primary" id="verifiedKeyReset" type="button">Reset password</button></div>`); bindRecoveryClose(modal, ()=>renderRecoveryMethods(modal,ctx)); modal.querySelector("#verifiedKeyBack").onclick=()=>renderRecoveryMethods(modal,ctx);
    modal.querySelector("#verifiedKeyReset").onclick=async e=>{const b=e.currentTarget;try{setError(modal,"verifiedKeyError","");const key=safe(modal.querySelector("#verifiedKeyValue")?.value).trim();if(!key)throw new Error("Enter your Recovery Key.");const next=readNewPassword(modal,"verifiedKey");b.disabled=true;const r=await rpc("app_account_self_recovery_complete_key_v2",{p_challenge_token:ctx.challengeToken,p_recovery_key:key,p_new_password:next});if(r?.ok===false)throw new Error(r.error||"Recovery Key could not be verified.");recoverySuccess(modal,"Password reset with Recovery Key");}catch(err){setError(modal,"verifiedKeyError",err?.message||"Recovery failed.");}finally{if(b?.isConnected)b.disabled=false;}};
  }
  function renderPasskeyRecovery(modal,ctx) {
    modal.innerHTML=recoveryShell("Recover with Face ID / Passkey","Your device will request biometric or passkey verification before a new password can be set.",`<div class="recovery-passkey-wait"><span class="recovery-passkey-orb"><i class="fa-solid fa-fingerprint"></i></span><strong>Verify your passkey</strong><small>No biometric data is sent to Triplem VIP.</small></div><p class="lock-error" id="verifiedPasskeyError"></p><div class="settings-sheet-footer"><button class="btn ghost" id="verifiedPasskeyBack" type="button">Back</button><button class="btn primary" id="verifiedPasskeyUse" type="button"><i class="fa-solid fa-fingerprint"></i> Verify passkey</button></div>`); bindRecoveryClose(modal, ()=>renderRecoveryMethods(modal,ctx)); modal.querySelector("#verifiedPasskeyBack").onclick=()=>renderRecoveryMethods(modal,ctx);
    modal.querySelector("#verifiedPasskeyUse").onclick=async e=>{const b=e.currentTarget;try{setError(modal,"verifiedPasskeyError","");b.disabled=true;const proof=await passkeyApi().getPasskeyProof();renderPasskeyNewPassword(modal,ctx,proof);}catch(err){setError(modal,"verifiedPasskeyError",err?.message||"Passkey verification failed.");}finally{if(b?.isConnected)b.disabled=false;}};
  }
  function renderPasskeyNewPassword(modal,ctx,proof){modal.innerHTML=recoveryShell("Passkey verified","Choose a new account password.",`${newPasswordFields("verifiedPasskeyPw")}<p class="lock-error" id="verifiedPasskeyPwError"></p><div class="settings-sheet-footer"><button class="btn ghost" id="verifiedPasskeyPwBack" type="button">Back</button><button class="btn primary" id="verifiedPasskeyPwReset" type="button">Reset password</button></div>`);bindRecoveryClose(modal, ()=>renderRecoveryMethods(modal,ctx));modal.querySelector("#verifiedPasskeyPwBack").onclick=()=>renderRecoveryMethods(modal,ctx);modal.querySelector("#verifiedPasskeyPwReset").onclick=async e=>{const b=e.currentTarget;try{setError(modal,"verifiedPasskeyPwError","");const next=readNewPassword(modal,"verifiedPasskeyPw");b.disabled=true;const r=await rpc("app_account_self_recovery_complete_passkey_v2",{p_challenge_token:ctx.challengeToken,p_credential_id:proof.credentialId,p_prf_secret:proof.prfSecret,p_new_password:next});if(r?.ok===false)throw new Error(r.error||"Passkey recovery failed.");recoverySuccess(modal,"Password reset with Passkey");}catch(err){setError(modal,"verifiedPasskeyPwError",err?.message||"Recovery failed.");}finally{if(b?.isConnected)b.disabled=false;}};}
  function renderTwoFactorRecovery(modal,ctx){modal.innerHTML=recoveryShell("Recover with 2FA","Use the current Authenticator code or an unused recovery code, then choose a new password.",`<label class="settings-field">Authenticator or recovery code<input id="verified2faCode" class="input settings-input" autocomplete="one-time-code" placeholder="6-digit code or recovery code"></label>${newPasswordFields("verified2fa")}<p class="lock-error" id="verified2faError"></p><div class="settings-sheet-footer"><button class="btn ghost" id="verified2faBack" type="button">Back</button><button class="btn primary" id="verified2faReset" type="button">Verify &amp; reset</button></div>`);bindRecoveryClose(modal, ()=>renderRecoveryMethods(modal,ctx));modal.querySelector("#verified2faBack").onclick=()=>renderRecoveryMethods(modal,ctx);modal.querySelector("#verified2faReset").onclick=async e=>{const b=e.currentTarget;try{setError(modal,"verified2faError","");const code=safe(modal.querySelector("#verified2faCode")?.value).trim();if(code.length<6)throw new Error("Enter your Authenticator or recovery code.");const next=readNewPassword(modal,"verified2fa");b.disabled=true;const r=await rpc("app_account_self_recovery_complete_two_factor_v2",{p_challenge_token:ctx.challengeToken,p_code:code,p_new_password:next});if(r?.ok===false)throw new Error(r.error||"2FA recovery failed.");recoverySuccess(modal,"Password reset with 2FA");}catch(err){setError(modal,"verified2faError",err?.message||"Recovery failed.");}finally{if(b?.isConnected)b.disabled=false;}};}
  function renderDeviceRecovery(modal,ctx){
    modal.innerHTML=recoveryShell("Approve from a trusted browser","A matching request will appear automatically on a browser you previously trusted and where this account is still signed in.",`<div class="trusted-recovery-code-card"><small>Request code</small><strong id="verifiedDeviceCode">Creating…</strong><p id="verifiedDeviceStatus">Preparing secure approval request…</p></div><p class="lock-error" id="verifiedDeviceError"></p><div class="settings-sheet-footer"><button class="btn ghost" id="verifiedDeviceBack" type="button">Back</button></div>`); bindRecoveryClose(modal, ()=>renderRecoveryMethods(modal,ctx)); modal.querySelector("#verifiedDeviceBack").onclick=()=>renderRecoveryMethods(modal,ctx);
    (async()=>{
      try{
        const r=await rpc("app_account_self_recovery_device_begin_v2",{p_challenge_token:ctx.challengeToken,p_user_agent:navigator.userAgent||""});
        if(r?.ok===false||!r?.request_token)throw new Error(r?.error||"Recovery approval could not start.");
        modal.querySelector("#verifiedDeviceCode").textContent=r.display_code||"Check trusted browser";
        modal.querySelector("#verifiedDeviceStatus").textContent="Approve this matching code from your trusted signed-in browser. The request remains valid for 15 minutes.";
        window.TriplemPush?.requestSecurityRecoveryPush?.(r.request_token).catch(()=>{});
        let busy=false;
        const poll=async()=>{
          if(busy||modal.classList.contains("hide"))return; busy=true;
          try{
            const status=await rpc("app_account_self_recovery_device_status",{p_request_token:r.request_token});
            const expiresMs=Date.parse(status?.expires_at||r?.expires_at||"");
            if(status?.status==="approved"){
              clearInterval(modal._securityRecoveryPoll); modal._securityRecoveryPoll=null;
              renderDeviceNewPassword(modal,ctx,r.request_token,r.display_code);
            }else if(["denied","used","expired"].includes(status?.status) || (Number.isFinite(expiresMs)&&expiresMs<=Date.now())){
              clearInterval(modal._securityRecoveryPoll); modal._securityRecoveryPoll=null;
              throw new Error("The trusted-browser request expired or was denied.");
            }
          }catch(err){setError(modal,"verifiedDeviceError",err?.message||"Could not check approval status.");}
          finally{busy=false;}
        };
        modal._securityRecoveryPoll=setInterval(poll,3000); poll();
      }catch(err){setError(modal,"verifiedDeviceError",err?.message||"Recovery approval could not start.");}
    })();
  }
  function renderDeviceNewPassword(modal,ctx,requestToken,code){if(modal._securityRecoveryPoll){clearInterval(modal._securityRecoveryPoll);modal._securityRecoveryPoll=null;}modal.innerHTML=recoveryShell("Trusted browser approved",`Request ${code||""} was approved. Choose your new password.`,`${newPasswordFields("verifiedDevicePw")}<p class="lock-error" id="verifiedDevicePwError"></p><div class="settings-sheet-footer"><button class="btn primary" id="verifiedDevicePwReset" type="button">Reset password</button></div>`);bindRecoveryClose(modal, ()=>renderRecoveryMethods(modal,ctx));modal.querySelector("#verifiedDevicePwReset").onclick=async e=>{const b=e.currentTarget;try{setError(modal,"verifiedDevicePwError","");const next=readNewPassword(modal,"verifiedDevicePw");b.disabled=true;const r=await rpc("app_account_self_recovery_complete_device_v2",{p_request_token:requestToken,p_new_password:next});if(r?.ok===false)throw new Error(r.error||"Trusted-browser recovery failed.");recoverySuccess(modal,"Password reset from trusted browser");}catch(err){setError(modal,"verifiedDevicePwError",err?.message||"Recovery failed.");}finally{if(b?.isConnected)b.disabled=false;}};}

  // ── Automatic pending-recovery prompt on a trusted signed-in browser ──────
  function ensureApprovalModal(){return ensureModal("trustedRecoveryIncomingModal","trusted-recovery-incoming-modal");}
  async function openTrustedRecoveryApprovalById(requestId=""){
    const u=user(); if(!u?.id)return false;
    const local=recoveryLocal(u.id); if(!local?.secret)return false;
    try{
      const result=await rpc("app_account_recovery_pending_device_requests",{p_device_secret:local.secret});
      const rows=Array.isArray(result?.requests)?result.requests:[];
      const req=requestId?rows.find(item=>safe(item?.id)===safe(requestId)):rows[0];
      if(!req?.id)return false;
      if(req.id!==approvalModalRequestId)showIncomingApproval(req,local.secret);
      return true;
    }catch(_){return false;}
  }
  async function checkPendingRecoveryApprovals(){ await openTrustedRecoveryApprovalById(""); }
  function showIncomingApproval(req,secret){
    approvalModalRequestId=req.id; const modal=ensureApprovalModal();
    modal.innerHTML=`<div class="modal-backdrop"></div><div class="modal-dialog account-security-approval-dialog" role="dialog" aria-modal="true"><div class="account-security-approval-icon"><i class="fa-solid fa-shield-halved"></i></div><p class="account-security-kicker">Password recovery request</p><h3>Approve this recovery?</h3><p>Another browser is requesting a password reset for your account. Compare the code before approving.</p><div class="trusted-recovery-approval-code"><small>Matching code</small><strong>${esc(req.display_code||"")}</strong></div><div class="account-security-request-device"><i class="fa-solid fa-globe"></i><span>${esc(req.user_agent||"Unknown browser")}</span></div><p class="lock-error" id="incomingApprovalError"></p><div class="account-security-approval-actions"><button class="btn ghost" id="incomingRecoveryDeny" type="button">Deny</button><button class="btn primary" id="incomingRecoveryApprove" type="button"><i class="fa-solid fa-check"></i> Approve</button></div></div>`;
    const finish=()=>{approvalModalRequestId="";closeModal(modal);};
    modal.querySelector("#incomingRecoveryDeny").onclick=async e=>{const b=e.currentTarget;try{b.disabled=true;await rpc("app_account_recovery_deny_device_request",{p_request_id:req.id,p_device_secret:secret});finish();}catch(err){setError(modal,"incomingApprovalError",err?.message||"Could not deny the request.");}finally{if(b?.isConnected)b.disabled=false;}};
    modal.querySelector("#incomingRecoveryApprove").onclick=async e=>{const b=e.currentTarget;try{b.disabled=true;await rpc("app_account_recovery_approve_device_request",{p_request_id:req.id,p_device_secret:secret});finish();}catch(err){setError(modal,"incomingApprovalError",err?.message||"Could not approve the request.");}finally{if(b?.isConnected)b.disabled=false;}};
    showModal(modal);
  }
  function consumeSecurityRecoveryDeepLink(){
    try{
      const url=new URL(location.href);
      if(url.searchParams.get("push")!=="security-recovery")return;
      const requestId=safe(url.searchParams.get("request"));
      setTimeout(()=>openTrustedRecoveryApprovalById(requestId),450);
      url.searchParams.delete("push"); url.searchParams.delete("request");
      history.replaceState(history.state,"",url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:"")+url.hash);
    }catch(_){}
  }
  function startAccountSecurityBackground(){ if(recoveryApprovalPoll)clearInterval(recoveryApprovalPoll); checkPendingRecoveryApprovals(); consumeSecurityRecoveryDeepLink(); recoveryApprovalPoll=setInterval(checkPendingRecoveryApprovals,12000); }
  function stopAccountSecurityBackground(){ if(recoveryApprovalPoll){clearInterval(recoveryApprovalPoll);recoveryApprovalPoll=null;} approvalModalRequestId=""; }

  // ── Unified Account Security center ────────────────────────────────────────
  function authMethodLabel(method){return ({password:"Password",two_factor_totp:"Password + 2FA",two_factor_recovery_code:"Password + recovery code",password_trusted_2fa:"Trusted browser",biometric_passkey:"Face ID / Passkey"})[safe(method)]||"Password";}
  function describeUa(ua){const s=safe(ua);let browser=/Edg\//.test(s)?"Edge":/Firefox\//.test(s)?"Firefox":/Chrome\//.test(s)?"Chrome":/Safari\//.test(s)?"Safari":"Browser";let os=/Windows/i.test(s)?"Windows":/Android/i.test(s)?"Android":/(iPhone|iPad|iOS)/i.test(s)?"iOS/iPadOS":/Mac OS|Macintosh/i.test(s)?"macOS":/Linux/i.test(s)?"Linux":"Device";return `${browser} · ${os}`;}
  async function loadSecurityData(){const local2=readTrusted2fa();const recLocal=recoveryLocal();const [status,sessions,twoDevices,recovery]=await Promise.all([rpc("app_account_security_status",{p_two_factor_device_secret:local2?.secret||null}),rpc("app_account_security_sessions",{}),rpc("app_two_factor_trusted_devices",{p_device_secret:local2?.secret||null}),rpc("app_account_recovery_status",{p_device_secret:recLocal?.secret||null})]);return{status,sessions,twoDevices,recovery};}
  async function openAccountSecurityCenter(options={}){
    if(!user()?.id){alert("Sign in to manage Account Security.");return;}
    const modal=ensureModal("accountSecurityCenterModal","account-security-center-modal");
    modal.innerHTML=`<div class="modal-backdrop" data-account-security-close></div><div class="modal-dialog settings-sheet account-security-dialog" role="dialog" aria-modal="true"><div class="settings-sheet-head account-security-head"><div><p class="account-security-kicker"><i class="fa-solid fa-shield-halved"></i> Triplem VIP Security</p><h3>Account Security</h3><p>Password, 2FA, biometrics, Smart PIN, recovery and signed-in devices in one place.</p></div><button class="btn ghost tiny" type="button" data-account-security-close aria-label="Close">✕</button></div><div class="modal-body settings-sheet-body account-security-body" id="accountSecurityCenterBody"><div class="account-security-loading"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Checking your security settings…</span></div></div></div>`;
    modal.querySelectorAll("[data-account-security-close]").forEach(x=>x.onclick=()=>closeModal(modal)); showModal(modal);
    try{const data=await loadSecurityData();renderSecurityCenter(modal,data,options);}catch(err){modal.querySelector("#accountSecurityCenterBody").innerHTML=`<div class="account-security-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>Security settings unavailable</strong><small>${esc(err?.message||"Could not load security settings.")}</small></div>`;}
  }
  function securityStatusBadge(on,labelOn="On",labelOff="Off"){return `<span class="account-security-state ${on?"is-on":"is-off"}"><i class="fa-solid ${on?"fa-circle-check":"fa-circle"}"></i>${esc(on?labelOn:labelOff)}</span>`;}
  function renderSecurityCenter(modal,data,options={}){
    const s=data.status||{}, r=data.recovery||{}, active=Array.isArray(data.sessions?.active)?data.sessions.active:[], history=Array.isArray(data.sessions?.history)?data.sessions.history:[], trusted=Array.isArray(data.twoDevices?.devices)?data.twoDevices.devices:[];
    const currentRecoveryTrusted=!!r.current_device_trusted;
    const currentTwoFactorTrusted=!!s.current_browser_trusted_for_two_factor;
    const currentFullyTrusted=currentRecoveryTrusted && (!s.two_factor_enabled || currentTwoFactorTrusted);
    const trustedCount=Math.max(trusted.length,Number(r.trusted_device_count||0));
    const body=modal.querySelector("#accountSecurityCenterBody"); if(!body)return;
    body.innerHTML=`
      ${options.onboarding?`<div class="account-security-onboarding"><i class="fa-solid fa-wand-magic-sparkles"></i><div><strong>Secure your new account</strong><small>These options are optional. You can configure them now or return later from Account Settings.</small></div></div>`:""}
      <section class="account-security-overview"><div><small>Security overview</small><strong>${[s.two_factor_enabled,s.passkey_enabled,r.recovery_key_enabled].filter(Boolean).length}/3 protections configured</strong></div><div class="account-security-overview-pills">${securityStatusBadge(s.two_factor_enabled,"2FA","2FA off")}${securityStatusBadge(s.passkey_enabled,"Passkey","Passkey off")}${securityStatusBadge(r.recovery_key_enabled,"Recovery Key","Key off")}</div></section>
      <section class="account-security-card"><div class="account-security-section-title"><span><i class="fa-solid fa-key"></i></span><div><strong>Password</strong><small>Your primary account credential.</small></div></div><button class="account-security-row" id="securityChangePassword" type="button"><span>Change password</span><i class="fa-solid fa-chevron-right"></i></button></section>
      <section class="account-security-card"><div class="account-security-section-title"><span><i class="fa-solid fa-mobile-screen-button"></i></span><div><strong>Authenticator App 2FA</strong><small>Require an authenticator on untrusted browsers.</small></div>${securityStatusBadge(s.two_factor_enabled)}</div><button class="account-security-row" id="securityManage2fa" type="button"><span>${s.two_factor_enabled?"Manage authenticator":"Set up authenticator"}</span><i class="fa-solid fa-chevron-right"></i></button></section>
      <section class="account-security-card biometric-security-card"><div class="account-security-section-title"><span><i class="fa-solid fa-fingerprint"></i></span><div><strong>Biometric &amp; Passkey</strong><small>Face ID, Touch ID, Windows Hello or compatible device passkeys.</small></div>${securityStatusBadge(s.passkey_enabled,"Configured","Not set")}</div>
        <button class="account-security-row" id="securitySetupPasskey" type="button"><span>${s.passkey_enabled?"Add / refresh biometric passkey":"Set up biometric sign-in"}</span><i class="fa-solid fa-chevron-right"></i></button>
        ${s.passkey_enabled?"":`<p class="account-security-fineprint"><i class="fa-solid fa-circle-info"></i><span>Turning on Quick Sign-In or biometric Smart PIN verification will securely create a standard device passkey first.</span></p>`}
        <label class="account-security-toggle-row"><span><strong>Quick sign-in</strong><small>Sign in without typing your password on this browser.</small></span><input id="securityQuickToggle" type="checkbox" ${s.quick_sign_in_enabled?"checked":""}><i></i></label>
        <label class="account-security-toggle-row"><span><strong>Biometric before Smart PIN</strong><small>If biometric succeeds, Smart PIN is skipped. If it fails, Smart PIN is shown.</small></span><input id="securityPinBypassToggle" type="checkbox" ${s.smart_pin_bypass_enabled?"checked":""}><i></i></label>
      </section>
      <section class="account-security-card smart-pin-security-card"><div class="account-security-section-title"><span><i class="fa-solid fa-key"></i></span><div><strong>Smart PIN</strong><small>Fast workspace lock after account sign-in.</small></div>${securityStatusBadge(s.smart_pin_enabled,"Enabled","Not set")}</div><div class="account-security-inline-actions smart-pin-security-actions"><button class="btn soft tiny" id="securityManageSmartPin" type="button"><i class="fa-solid ${s.smart_pin_enabled?"fa-pen":"fa-plus"}" aria-hidden="true"></i>${s.smart_pin_enabled?"Change Smart PIN":"Set Smart PIN"}</button>${s.smart_pin_enabled?`<button class="btn ghost tiny smart-pin-remove-btn" id="securityRemoveSmartPin" type="button"><i class="fa-solid fa-trash-can" aria-hidden="true"></i>Remove</button>`:""}</div></section>
      <section class="account-security-card"><div class="account-security-section-title"><span><i class="fa-solid fa-life-ring"></i></span><div><strong>Password Recovery</strong><small>Recovery Key, Passkey and trusted-browser approval.</small></div>${securityStatusBadge(!!(r.recovery_key_enabled||r.passkey_enabled||r.trusted_device_count),"Protected","Review")}</div><button class="account-security-row" id="securityManageRecovery" type="button"><span>Manage recovery methods</span><i class="fa-solid fa-chevron-right"></i></button></section>
      <section class="account-security-card account-security-card-wide"><div class="account-security-section-title"><span><i class="fa-solid fa-shield-heart"></i></span><div><strong>Trusted browsers</strong><small>A trusted browser can skip Authenticator for 30 days and approve recovery requests.</small></div><span class="account-security-count">${trustedCount}</span></div><div class="account-security-inline-actions">${currentFullyTrusted?`<span class="account-security-trusted-current"><i class="fa-solid fa-circle-check"></i> This browser is trusted</span>`:`<button class="btn primary" id="securityTrustCurrent" type="button"><i class="fa-solid fa-plus"></i> Trust this browser</button>`}<button class="btn ghost" id="securityRefreshTrusted" type="button"><i class="fa-solid fa-rotate"></i> Refresh</button></div><div class="account-security-device-list">${trusted.length?trusted.map(d=>`<div class="account-security-device"><span class="device-icon"><i class="fa-solid fa-laptop"></i></span><div><strong>${esc(d.label||describeUa(d.user_agent))}${d.current?` <em>Current</em>`:""}</strong><small>${esc(describeUa(d.user_agent))} · Expires ${esc(formatDate(d.expires_at))}</small></div><button class="btn ghost tiny" data-revoke-2fa-device="${esc(d.id)}" type="button">Remove</button></div>`).join(""):`<div class="account-security-empty compact"><small>${currentRecoveryTrusted?"This browser is trusted for recovery approval.":"No browser is currently trusted."}</small></div>`}</div></section>
      <section class="account-security-card account-security-card-wide"><div class="account-security-section-title"><span><i class="fa-solid fa-desktop"></i></span><div><strong>Logged-in devices</strong><small>Review active sessions and sign out a device remotely.</small></div><span class="account-security-count">${active.length}</span></div><div class="account-security-device-list">${active.map(d=>`<div class="account-security-device"><span class="device-icon"><i class="fa-solid fa-display"></i></span><div><strong>${esc(describeUa(d.user_agent))}${d.current?` <em>Current</em>`:""}</strong><small>${esc(authMethodLabel(d.auth_method))} · Last active ${esc(formatDate(d.last_seen_at))}</small></div>${d.current?`<span class="account-security-state is-on">This device</span>`:`<button class="btn ghost tiny" data-revoke-session="${esc(d.id)}" type="button">Sign out</button>`}</div>`).join("")}</div><details class="account-security-history"><summary>Login history <span>${history.length}</span></summary><div class="account-security-history-list">${history.map(h=>`<div><span class="history-dot ${h.status}"></span><p><strong>${esc(describeUa(h.user_agent))}</strong><small>${esc(authMethodLabel(h.auth_method))} · ${esc(formatDate(h.created_at))}</small></p><em>${esc(h.status)}</em></div>`).join("")}</div></details></section>
      <p class="lock-error" id="accountSecurityCenterError"></p>`;
    bindSecurityActions(modal,data,options);
  }
  async function refreshSecurityCenter(modal,options={}){try{const data=await loadSecurityData();renderSecurityCenter(modal,data,options);}catch(err){setError(modal,"accountSecurityCenterError",err?.message||"Could not refresh Account Security.");}}
  function bindSecurityActions(modal,data,options){const s=data.status||{};
    modal.querySelector("#securityChangePassword")?.addEventListener("click",()=>window.openAccountPasswordChangeModal?.());
    modal.querySelector("#securityManage2fa")?.addEventListener("click",()=>window.openTwoFactorManagement?.());
    modal.querySelector("#securityManageRecovery")?.addEventListener("click",()=>window.openAccountRecoveryManagement?.());
    modal.querySelector("#securityManageSmartPin")?.addEventListener("click",async()=>{try{await window.TriplemSmartPinSecurity?.manage?.();await refreshSecurityCenter(modal,options);}catch(_){}});
    modal.querySelector("#securityRemoveSmartPin")?.addEventListener("click",async()=>{try{await window.TriplemSmartPinSecurity?.remove?.();await refreshSecurityCenter(modal,options);}catch(_){}});
    modal.querySelector("#securitySetupPasskey")?.addEventListener("click",async e=>{const b=e.currentTarget;try{setError(modal,"accountSecurityCenterError","");const pw=options.currentPassword||await promptCurrentPassword("Set up biometric sign-in","Confirm your password, then your device will ask for Face ID, Touch ID, Windows Hello, fingerprint or another passkey verification method.");if(!pw)return;b.disabled=true;await createStandardSecurityPasskey(pw,{quick:true,bypass:!!s.smart_pin_bypass_enabled});if(options.currentPassword)options.currentPassword=pw;await refreshSecurityCenter(modal,options);}catch(err){setError(modal,"accountSecurityCenterError",err?.message||"Biometric passkey setup failed.");}finally{if(b?.isConnected)b.disabled=false;}});
    ["securityQuickToggle","securityPinBypassToggle"].forEach(id=>modal.querySelector(`#${id}`)?.addEventListener("change",async e=>{
      const changed=e.target,previous=!changed.checked,quick=!!modal.querySelector("#securityQuickToggle")?.checked,bypass=!!modal.querySelector("#securityPinBypassToggle")?.checked;
      try{
        setError(modal,"accountSecurityCenterError","");
        if(bypass&&!s.smart_pin_enabled)throw new Error("Set up Smart PIN first before enabling biometric verification before Smart PIN.");
        const pw=options.currentPassword||await promptCurrentPassword(s.passkey_enabled?"Confirm biometric settings":"Set up biometric sign-in","Confirm your password to protect this security change.");
        if(!pw){changed.checked=previous;return;}
        if(!s.passkey_enabled&&(quick||bypass))await createStandardSecurityPasskey(pw,{quick,bypass});
        else await setStandardBiometricPreferences(pw,quick,bypass);
        if(options.currentPassword)options.currentPassword=pw;
        await refreshSecurityCenter(modal,options);
      }catch(err){changed.checked=previous;setError(modal,"accountSecurityCenterError",err?.message||"Could not update biometric settings.");}
    }));
    modal.querySelector("#securityTrustCurrent")?.addEventListener("click",async e=>{const b=e.currentTarget;try{const pw=options.currentPassword||await promptCurrentPassword("Trust this browser","This browser will be allowed to approve recovery requests. If 2FA is enabled, it can also skip Authenticator for 30 days.");if(!pw)return;b.disabled=true;const existingRecovery=recoveryLocal(user()?.id),existingTwoFactor=readTrusted2fa(user()?.username);const secret=existingRecovery?.secret||existingTwoFactor?.secret||randomSecret(),label=existingRecovery?.label||existingTwoFactor?.label||deviceLabel();let trusted2fa=null;if(s.two_factor_enabled){trusted2fa=await rpc("app_two_factor_trust_device",{p_password:pw,p_device_secret:secret,p_label:label,p_user_agent:navigator.userAgent||"",p_days:30});writeTrusted2fa(user()?.username,secret,label,trusted2fa?.expires_at||"");}await rpc("app_account_recovery_trust_device",{p_password:pw,p_device_secret:secret,p_label:label,p_user_agent:navigator.userAgent||""});writeRecoveryLocal(secret,label,user()?.id);if(options.currentPassword)options.currentPassword=pw;startAccountSecurityBackground();await refreshSecurityCenter(modal,options);}catch(err){setError(modal,"accountSecurityCenterError",err?.message||"Could not trust this browser.");}finally{if(b?.isConnected)b.disabled=false;}});
    modal.querySelector("#securityRefreshTrusted")?.addEventListener("click",()=>refreshSecurityCenter(modal,options));
    modal.querySelectorAll("[data-revoke-2fa-device]").forEach(btn=>btn.onclick=async()=>{try{const pw=await promptCurrentPassword("Remove trusted browser");if(!pw)return;const id=btn.dataset.revoke2faDevice;const wasCurrent=Array.isArray(data.twoDevices?.devices)&&data.twoDevices.devices.some(d=>d.id===id&&d.current);await rpc("app_two_factor_revoke_trusted_device",{p_password:pw,p_device_id:id});if(wasCurrent)clearTrusted2fa(user()?.username);await refreshSecurityCenter(modal,options);}catch(err){setError(modal,"accountSecurityCenterError",err?.message||"Could not remove trusted browser.");}});
    modal.querySelectorAll("[data-revoke-session]").forEach(btn=>btn.onclick=async()=>{try{const pw=await promptCurrentPassword("Sign out this device","The selected session will be revoked immediately.");if(!pw)return;await rpc("app_account_security_revoke_session",{p_session_id:btn.dataset.revokeSession,p_password:pw});await refreshSecurityCenter(modal,options);}catch(err){setError(modal,"accountSecurityCenterError",err?.message||"Could not sign out the device.");}});
  }

  async function refreshAccountSecuritySummary(modal){const text=modal?.querySelector?.("#accountSecuritySummaryText"),pill=modal?.querySelector?.("#accountSecuritySummaryPill");if(!text||!pill)return;try{const local=readTrusted2fa();const s=await rpc("app_account_security_status",{p_two_factor_device_secret:local?.secret||null});const count=[s.two_factor_enabled,s.passkey_enabled,s.smart_pin_enabled].filter(Boolean).length;text.textContent=`${count}/3 core protections configured · ${Number(s.active_session_count||0)} active device${Number(s.active_session_count||0)===1?"":"s"}`;pill.textContent=count>=2?"Protected":"Review";pill.classList.toggle("is-on",count>=2);pill.classList.remove("is-loading");}catch(_){text.textContent="Open to review password, 2FA, biometrics, Smart PIN and devices.";pill.textContent="Security";pill.classList.remove("is-loading");}}

  async function postSignupSecuritySetup({currentPassword=""}={}){return openAccountSecurityCenter({onboarding:true,currentPassword:safe(currentPassword)});}

  function installPasswordEnterParity(){
    if(document.documentElement.dataset.triplemPasswordEnterParity==="1")return;
    document.documentElement.dataset.triplemPasswordEnterParity="1";
    document.addEventListener("keydown",event=>{
      if(event.defaultPrevented||event.key!=="Enter"||event.isComposing)return;
      const input=event.target;
      if(!(input instanceof HTMLInputElement)||input.type!=="password"||input.form)return;
      const scope=input.closest(".modal,.lock-card,.two-factor-login-card,.settings-sheet"); if(!scope)return;
      const candidates=[...scope.querySelectorAll(".settings-sheet-footer .btn.primary:not([disabled]),.modal-footer .btn.primary:not([disabled]),.account-security-approval-actions .btn.primary:not([disabled])")].filter(btn=>btn.offsetParent!==null&&!btn.classList.contains("hide"));
      if(candidates.length===1){event.preventDefault();candidates[0].click();}
    });
  }

  window.attemptTrustedTwoFactorLogin=attemptTrustedTwoFactorLogin;
  window.enrollTrustedBrowserAfterTwoFactor=enrollTrustedBrowserAfterTwoFactor;
  window.tagCurrentSessionSecurityMethod=tagCurrentSession;
  window.tryBiometricWorkspaceUnlock=tryBiometricWorkspaceUnlock;
  window.performBiometricQuickSignIn=performBiometricQuickSignIn;
  window.openUnifiedPasswordRecovery=openVerifiedRecovery;
  window.openPasswordRecovery=openVerifiedRecovery;
  window.openAccountSecurityCenter=openAccountSecurityCenter;
  window.refreshAccountSecuritySummary=refreshAccountSecuritySummary;
  window.startAccountSecurityBackground=startAccountSecurityBackground;
  window.openTrustedRecoveryApprovalById=openTrustedRecoveryApprovalById;
  window.stopAccountSecurityBackground=stopAccountSecurityBackground;
  window.openPostSignupRecoverySetup=postSignupSecuritySetup;

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>{installQuickSignInButton();installPasswordEnterParity();},{once:true}); else {installQuickSignInButton();installPasswordEnterParity();}
})();
