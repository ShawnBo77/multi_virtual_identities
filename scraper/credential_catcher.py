# credential_catcher_strict.py
import json
from mitmproxy import http
from urllib.parse import parse_qs

# 儲存憑證的檔案名稱
CREDENTIALS_FILE = "instagram_credentials.json"
TARGET_HOST = "www.instagram.com"
TARGET_PATH_KEYWORD = "graphql/query"

# 所有必需的欄位
REQUIRED_HEADERS = ["cookie", "x-csrftoken", "user-agent", "x-fb-lsd"]
REQUIRED_FORM_DATA = ["fb_dtsg", "jazoest", "lsd"]
REQUIRED_COOKIES = ["sessionid", "csrftoken", "ds_user_id", "rur"]


class CredentialCatcher:
    def response(self, flow: http.HTTPFlow) -> None:
        request = flow.request
        
        if (TARGET_HOST in request.pretty_host and
            TARGET_PATH_KEYWORD in request.path and
            request.method == "POST"):

            try: 
                headers_lower = {k.lower(): v for k, v in request.headers.items()}
                extracted_headers = {key: headers_lower[key] for key in REQUIRED_HEADERS}
                
                raw_cookie_str = extracted_headers['cookie']
                corrected_cookie_str = raw_cookie_str.replace(", ", "; ")
                extracted_headers['cookie'] = corrected_cookie_str

                form_content = request.urlencoded_form
                extracted_form_data = {key: form_content[key] for key in REQUIRED_FORM_DATA}

                credentials = {
                    "headers": extracted_headers,
                    "form_data": extracted_form_data
                }
                
                # 檢查欄位是否異常
                for key, value in credentials["headers"].items():
                    if not value:
                        raise ValueError(f"Header '{key}' is empty!")
                
                for key, value in credentials["form_data"].items():
                    if not value:
                        raise ValueError(f"Form data '{key}' is empty!")

                cookie_str = credentials["headers"]["cookie"]
                for cookie_name in REQUIRED_COOKIES:
                    if f"{cookie_name}=" not in cookie_str:
                        raise ValueError(f"Missing required cookie: '{cookie_name}'!")

                # 寫入文件儲存
                with open(CREDENTIALS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(credentials, f, indent=4)
                
                print(f"[+] 身分資訊提取成功，儲存至 {CREDENTIALS_FILE}")

            except (KeyError, ValueError) as e:
                print(f"[!] 身分資訊提取失敗: {e}。")


addons = [
    CredentialCatcher()
]