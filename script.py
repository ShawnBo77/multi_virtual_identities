from mitmproxy import http, ctx
import json

# ================================================================
# ==                      使用者替換的憑證                       ==
# ================================================================

SHARED_ACCOUNT_CREDENTIALS = {
    "headers": {
        "Cookie": 'datr=yui7aD4g7Y3PXZRwp-Fpmv_Q; ig_did=9BFAEFE1-076E-4EE4-82F3-AC040630AD71; wd=1920x919; mid=aLvoygALAAFA6uWH6mNXfaVEnL07; ps_l=1; ps_n=1; csrftoken=L8D8L8rZNnTFVM0NBfwLF1JStUk9p3FK; ig_nrcb=1; sessionid=76820947138%3AP4eJ7UOfWWhJHh%3A24%3AAYcRQcl40wQ1GIMhTY8EcYYu_jOFCHVtQ4XER4xdWw; ds_user_id=76820947138; rur="NHA\\05476820947138\\0541788780875:01fe43382410002a8d2c745273bdcf26437f53fa41cbbd84086723dbb3ece56b440d5363"',
        "X-CSRFToken": "L8D8L8rZNnTFVM0NBfwLF1JStUk9p3FK",
        "X-IG-App-ID": "936619743392459",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
        "X-FB-LSD": "craOCl6ruITCnR54W-TG34"
    },
    
    "form_data": {
        "fb_dtsg": "NAftwGF_4lo_mSY4Bfc_tNemWtgmVQpAmBn_X1lmp7PsPXxcTa-G-7w:17865553615041151:1757227904",
        "jazoest": "26459",
        "lsd": "craOCl6ruITCnR54W-TG34",
        "__user": "0"
    }
}


class GlobalIdentitySwapper:

    def request(self, flow: http.HTTPFlow) -> None:
        if "www.instagram.com" not in flow.request.host:
            return

        target_headers = SHARED_ACCOUNT_CREDENTIALS["headers"]
        target_form_data = SHARED_ACCOUNT_CREDENTIALS["form_data"]

        # 替換 Headers
        for key, value in target_headers.items():
            flow.request.headers[key] = value

        # 替換 Body (僅對 POST 請求)
        if flow.request.method == "POST" and "application/x-www-form-urlencoded" in flow.request.headers.get("Content-Type", ""):

            for key, value in target_form_data.items():
                if key in flow.request.urlencoded_form:
                    flow.request.urlencoded_form[key] = value
        

# 註冊 Addon
addons = [
    GlobalIdentitySwapper()
]