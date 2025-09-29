import json
import time
import sys

from seleniumwire import webdriver
from selenium.webdriver.firefox.service import Service as FirefoxService
from webdriver_manager.firefox import GeckoDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

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

def manual_login_and_save_cookies(filename):
    """
    啟動瀏覽器並等待用戶手動登入，然後保存 cookie。
    """
    print("--- 正在啟動 Firefox 瀏覽器 ---")
    service = FirefoxService(GeckoDriverManager().install())
    options = webdriver.FirefoxOptions()
    
    driver = webdriver.Firefox(service=service, options=options)
    wait = WebDriverWait(driver, 300) # 給予用戶充足的時間登入 (300秒 = 5分鐘)

    try:
        # 導航到登入頁面
        driver.get("https://www.instagram.com/accounts/login/")
        print("="*60)
        print("瀏覽器已打開，請在瀏覽器中手動完成以下操作：")
        print("  1. 輸入您的帳號和密碼。")
        print("  2. 完成可能出現的人機驗證或兩步驟驗證。")
        print("  3. 確認您已成功登入並看到 Instagram 主頁。")
        print("\n完成後，請回到此終端機視窗，然後按下 [Enter] 鍵繼續...")
        print("="*60)
        
        # 暫停腳本，等待用戶輸入
        input() # 這行程式碼會阻塞腳本，直到用戶按下 Enter

        print("\n檢測到用戶操作，正在驗證登入狀態...")
        
        # 驗證登入是否成功
        if "accounts/login" in driver.current_url:
            print("錯誤：您仍在登入頁面。請確保您已成功登入。")
            return

        # 再次檢查主頁的標誌性元素是否存在
        logo_indicator_xpath = "//*[name()='svg' and @aria-label='Instagram']"
        wait.until(EC.visibility_of_element_located((By.XPATH, logo_indicator_xpath)))
        print("--- 確認登入成功！ ---")
        
        # 保存 Cookie
        if not save_selenium_credentials_to_json(driver, filename):
            print("保存 Cookie 失敗。")

    except TimeoutException:
        print("\n錯誤：等待主頁元素超時。")
        driver.save_screenshot("login_timeout_error.png")
        print("  - 錯誤畫面已保存至 login_timeout_error.png")
    except Exception as e:
        print(f"\n發生未知錯誤: {e}")
    finally:
        print("--- 腳本執行完畢，正在關閉瀏覽器... ---")
        input("[Enter] to terminate the process.\n")
        driver.quit()

if __name__ == "__main__":
    try:
        output_filename = "instagram_credentials_selenium_manual.json"
        manual_login_and_save_cookies(output_filename)
    except KeyboardInterrupt:
        print("\n\n操作中斷。")
        sys.exit(0)