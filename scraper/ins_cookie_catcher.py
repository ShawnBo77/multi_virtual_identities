import json
import time
import getpass
import sys
import random

from seleniumwire import webdriver
from selenium.webdriver.firefox.service import Service as FirefoxService
from webdriver_manager.firefox import GeckoDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

def get_credentials():
    """獲取用戶名和密碼。"""
    username = input("請輸入您的 Instagram 帳號: ")
    password = input("請輸入您的 Instagram 密碼: ") # getpass.getpass
    return username, password

def save_selenium_credentials_to_json(driver, filename):
    """
    從 Selenium driver 提取 cookie 並保存。
    """
    print("\n正在提取登入後的 Cookie...")
    
    cookies_for_selenium = driver.get_cookies()
    
    # 檢查 cookie 是否完整
    critical_cookies = ['sessionid', 'ds_user_id', 'csrftoken', 'rur', 'datr', 'mid', 'ig_did', 'wd']
    
    cookies_names_set = {c['name'] for c in cookies_for_selenium}

    missing_cookies = []
    for critical_name in critical_cookies:
        if critical_name not in cookies_names_set:
            missing_cookies.append(critical_name)

    if missing_cookies:
        print(f"錯誤：未能獲取所有關鍵 Cookie。")
        print(f"  - 缺失的 Cookie: {', '.join(missing_cookies)}")
    else:
        print("Cookie 提取成功！")
    
    credentials_data = {
        "user_agent": driver.execute_script("return navigator.userAgent;"),
        "cookie_string": "; ".join([f"{c['name']}={c['value']}" for c in cookies_for_selenium]),
        "cookies_for_selenium": cookies_for_selenium
    }
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(credentials_data, f, ensure_ascii=False, indent=4)
        
    print(f"\n憑證已成功保存至 '{filename}' 檔案。")
    return True

def login_and_save_cookies(username, password, filename):
    """
    使用 Selenium 登入 Instagram 並保存 Selenium 專用的 cookie 檔案。
    """
    print("--- 正在啟動 Firefox 瀏覽器 ---")
    service = FirefoxService(GeckoDriverManager().install())
    options = webdriver.FirefoxOptions()
    # options.add_argument("--headless")
    
    driver = webdriver.Firefox(service=service, options=options)
    wait = WebDriverWait(driver, 15)

    try:
        driver.get("https://www.instagram.com/accounts/login/")
        print("  - 已打開登入頁面。")

        username_input = wait.until(EC.presence_of_element_located((By.NAME, "username")))
        password_input = driver.find_element(By.NAME, "password")

        time.sleep(random.uniform(0.5, 1)) 
        username_input.send_keys(username)
        time.sleep(random.uniform(1, 2)) 
        password_input.send_keys(password)
        print("  - 已填寫帳號和密碼。")
        time.sleep(random.uniform(1, 2)) 

        login_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[@type='submit']")))
        login_button.click()
        print("  - 已點擊登入按鈕，正在等待登入...")

        # 檢查封包內榮，確認登入是否成功
        login_api_url = 'api/v1/web/accounts/login/ajax/'
        req = driver.wait_for_request(login_api_url, timeout=15)
            
        # 確保請求有回應
        if req.response:
            response_body = req.response.body.decode('utf-8', errors='ignore')
            response_json = json.loads(response_body)
            
            # 判斷登入是否成功
            if response_json.get('authenticated') is True:
                print("--- API 驗證成功：authenticated = true ---")
                critical_cookies = ['sessionid', 'ds_user_id', 'csrftoken']
                # 檢查 cookie 是否成功寫入瀏覽器
                try:
                    cookie_wait = WebDriverWait(driver, 10)
                
                    all_cookies_present = lambda d: all(d.get_cookie(c) is not None for c in critical_cookies)
                    cookie_wait.until(all_cookies_present)
                    print("  - Cookie 已成功寫入瀏覽器。")
                except TimeoutException:
                    print("  - 錯誤：cookie 寫入超時。")
                    raise

            else:
                print("\n--- 登入失敗 ---")
                print(f"  - API 回應: {response_body}")
                print("  - 原因可能：帳號密碼錯誤，或需要進行人機驗證。")

        else:
            print("錯誤：捕獲到登入 API 請求，但沒有收到回應。")

        try:
            # 準備提取 cookie
            time.sleep(random.uniform(10, 15))
            driver.get("https://www.instagram.com/")
            time.sleep(random.uniform(15, 20))

            logo_indicator_xpath = "//*[name()='svg'][@aria-label='Instagram' or .//*[text()='Instagram']]"
            wait.until(EC.visibility_of_element_located((By.XPATH, logo_indicator_xpath)))
            print("--- 登入成功！已在頁面頂部偵測到 Instagram Logo。 ---")
            time.sleep(random.uniform(4, 5)) 
        except Exception as e:
            print(f"\n錯誤: {e}")
        
        # 保存 Cookie
        if not save_selenium_credentials_to_json(driver, filename):
            print("保存 Cookie 失敗。")

    except TimeoutException:
        print("\n錯誤：操作超時。")
        driver.save_screenshot("login_error.png")
        print("  - 錯誤畫面已保存至 login_error.png")
    except Exception as e:
        print(f"\n錯誤: {e}")
    finally:
        print("--- 腳本執行完畢。 ---")
        input("[Enter] to terminate the process.\n")
        driver.quit()

if __name__ == "__main__":
    try:
        user, pwd = get_credentials()
        if user and pwd:
            login_and_save_cookies(user, pwd, f"ins_cred_se_{user[:8]}.json")
        else:
            print("未輸入帳號或密碼，請重試。")
    except KeyboardInterrupt:
        print("\n\n操作中斷。")
        sys.exit(0)