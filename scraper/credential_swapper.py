from mitmproxy import http, ctx
import json
import os

# 憑證替換檔案
INSTAGRAM_CREDENTIALS_FILE = "instagram_credentials.json"
TARGET_HOST = "www.instagram.com"

class GlobalIdentitySwapper:
    def __init__(self):
        self.creds = None
        self.last_modified_time = 0
        self.load_credentials()
    
    def load_credentials(self):
        """從檔案中讀取憑證資訊，並處理檔案不存在或變更的情況"""
        try:
            mtime = os.path.getmtime(INSTAGRAM_CREDENTIALS_FILE)
            if mtime > self.last_modified_time:
                with open(INSTAGRAM_CREDENTIALS_FILE, 'r', encoding='utf-8') as f:
                    self.creds = json.load(f)
                    self.last_modified_time = mtime
                    ctx.log.info(f"[*] 成功加載/更新了憑證檔案: {INSTAGRAM_CREDENTIALS_FILE}")
        except FileNotFoundError:
                ctx.log.warn(f"[!] 找不到憑證檔案 {INSTAGRAM_CREDENTIALS_FILE}。")
        except (json.JSONDecodeError, Exception) as e:
            ctx.log.error(f"[!] 讀取憑證檔案時出錯: {e}")
            self.creds = None

    def request(self, flow: http.HTTPFlow) -> None:
        """在每個請求發出前攔截並修改"""
        # 每次請求都檢查憑證檔案是否有更新
        self.load_credentials()
        if not self.creds:
            return

        if TARGET_HOST not in flow.request.pretty_host:
            return

        target_headers = self.creds["headers"]
        target_form_data = self.creds["form_data"]

        # 替換 Headers( 除了 cookie )
        for key, value in target_headers.items():
            if key.lower() != 'cookie':
                flow.request.headers[key] = value
        
        # 用 mitmproxy 的 API 替換 cookie
        if 'cookie' in target_headers and target_headers['cookie']:
            flow.request.cookies.clear()
            cookie_string = target_headers['cookie']
            # 將 "key1=value1; key2=value2" 的字符串分割成 ["key1=value1", "key2=value2"]
            cookie_pairs = cookie_string.split(';')
        
            for pair in cookie_pairs:
                if '=' in pair:
                    # 使用 split('=', 1) 只在第一個等號處分割
                    name, value = pair.split('=', 1)
                    name = name.strip()
                    value = value.strip()
                    flow.request.cookies[name] = value

        # 替換 Body (僅對 POST 請求)
        if flow.request.method == "POST" and "application/x-www-form-urlencoded" in flow.request.headers.get("Content-Type", ""):
            for key, value in target_form_data.items():
                if key in flow.request.urlencoded_form:
                    flow.request.urlencoded_form[key] = value
        

# 註冊 Addon
addons = [
    GlobalIdentitySwapper()
]