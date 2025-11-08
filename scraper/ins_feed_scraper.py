import json
import os
import time
import random
import sys
import argparse
from pathlib import Path

from seleniumwire import webdriver
from seleniumwire.utils import decode
from selenium.webdriver.firefox.service import Service as FirefoxService
from webdriver_manager.firefox import GeckoDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException

def save_json_no_overwrite(data, output_path):
    """
    將資料儲存為 JSON 檔案。
    如果檔案已存在，會自動在檔名後加上後綴 (如 _2, _3) 來避免覆蓋。
    """
    path = Path(output_path)
    directory = path.parent
    
    if path.exists():
        filename_stem = path.stem
        extension = path.suffix
        
        counter = 2
        while True:
            new_filename = f"{filename_stem}_{counter}{extension}"
            new_path = directory / new_filename
            
            if not new_path.exists():
                output_path = new_path
                break

            counter += 1
        
        # print(f"\n注意：原始檔案已存在。結果將改儲存至 {output_path}")
    
    os.makedirs(directory, exist_ok=True) # 用 makedirs 自動建立所有不存在的中間目錄
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    
    print(f"結果已成功儲存至 {output_path}")

def load_selenium_credentials(filepath):
    """載入憑證檔案。"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            creds = json.load(f)
        
        if not creds.get("cookies_for_selenium") or not creds.get("user_agent"):
            raise ValueError("憑證檔案中缺少 'cookies_for_selenium' 或 'user_agent'。")
        
        return creds
    except FileNotFoundError:
        print(f"錯誤：找不到憑證檔案 '{filepath}'。")
        sys.exit(1)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"錯誤：解析憑證檔案失敗: {e}")
        sys.exit(1)

def inject_cookies_and_login(driver: webdriver.Firefox, url: str, cookies: list) -> bool:
    """
    向 WebDriver 注入 cookies。
    """
    try:
        driver.get(url)

        if not cookies:
            print("  - 警告: 未提供任何 cookie。")
            return False

        for cookie in cookies:
            if 'name' in cookie and 'value' in cookie:
                driver.add_cookie(cookie)
            else:
                print(f"  - 警告: 忽略格式錯誤的 cookie: {cookie}")
        
        print("  - Cookie 注入成功，已模擬登入狀態。")
        return True
    
    except Exception as e:
        print(f"  - 錯誤: 注入 Cookie 時發生意外: {e}")
        return False

def scroll_down(driver):
    """向下滾動頁面。"""
    last_height = driver.execute_script("return document.body.scrollHeight")
    viewport_height = driver.execute_script("return window.innerHeight") # 視窗高度
    new_height = 0
    while True:
        scroll_increment = viewport_height * random.uniform(0.2, 0.5)
        current_scroll_y = driver.execute_script("return window.scrollY") # 目前的位置

        if current_scroll_y + viewport_height >= last_height - 10:
            print("  - 已滑頁面底部，未發現新內容。")
            return False

        next_scroll_y = min(current_scroll_y + scroll_increment, last_height - viewport_height - 10)
        driver.execute_script(f"window.scrollTo(0, {next_scroll_y});")

        time.sleep(random.uniform(0.4, 0.9))
        
        # 檢查頁面高度是否有變化
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height > last_height:
            print(f"  - 滾動中偵測到頁面高度增加 (從 {last_height}px -> {new_height}px)，停止滾動。")
            return True

def save_posts_as_individual_files(posts_data: list, target_username: str):
    """
    將抓取到的貼文儲存為獨立的 JSON 檔案。
    """
    if not posts_data:
        print("未提供任何貼文資料，無需儲存。")
        return

    print("--- 開始將貼文儲存為獨立檔案 ---")

    base_dir = "../data"
    user_dir = os.path.join(base_dir, target_username)
    posts_dir = os.path.join(user_dir, "posts")
    
    os.makedirs(posts_dir, exist_ok=True) # 用 makedirs 自動建立所有不存在的中間目錄
    print(f"  - 貼文將儲存在: {posts_dir}")

    for post_node in posts_data:
        post_id = post_node.get('id')
        if not post_id:
            print("  - 警告：發現一篇沒有 ID 的貼文，已跳過。")
            continue

        post_filename = os.path.join(posts_dir, f"{post_id}.json")
        try:
            with open(post_filename, 'w', encoding='utf-8') as f:
                json.dump(post_node, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"  - 錯誤：儲存檔案 {post_filename} 失敗: {e}")
            continue

    print("--- 儲存流程完成 ---")

def get_user_posts(target_username: str, num_posts_to_fetch: int, credentials: dict, max_scroll_attempts: int):
    print(f"--- 準備使用 Selenium-Wire (Firefox) 抓取 @{target_username} 的貼文 ---")

    service = FirefoxService(GeckoDriverManager().install())
    options = webdriver.FirefoxOptions()
    # options.add_argument("--headless")
    options.set_preference('general.useragent.override', credentials['user_agent'])
    
    driver = webdriver.Firefox(service=service, options=options)
    TARGET_URL = "https://www.instagram.com/"
    
    if not inject_cookies_and_login(driver, TARGET_URL, credentials.get("cookies_for_selenium", [])):
        print("  - 登入失敗，終止抓取程序。")
        driver.quit()
        return []

    time.sleep(random.uniform(2, 5))

    profile_url = f"{TARGET_URL}/{target_username}/"
    driver.get(profile_url)
    
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.XPATH, "//header"))
        )
        print(f"  - 已導航至目標頁面並確認加載完成: {profile_url}")
    except TimeoutException:
        print("  - 錯誤：等待頁面加載超時。可能是用戶不存在、網路問題或頁面結構已更改。")
        driver.quit()
        return []

    time.sleep(random.uniform(3, 5)) # 模擬真人查看頁面的時間

    all_posts = []
    processed_post_ids = set()
    processed_request_ids = set() 
    scroll_attempts = 0

    packet_count = 0
    reach_bottom_flag = 0
    while len(all_posts) < num_posts_to_fetch and scroll_attempts < max_scroll_attempts and not reach_bottom_flag:
        print(f"\n第 {scroll_attempts + 1} 輪滾動開始!")
        
        if scroll_attempts != 0:
            # 清除舊的請求記錄，只留當次滾動後的新請求，
            # 但遍歷 driver.requests 後到的封包就不會被跑到
            # del driver.requests
            
            if not scroll_down(driver):
                print("  - 滾動後頁面未加載新內容，可能已達頁面底部。")
                reach_bottom_flag = 1
        
            scroll_pause_time = random.uniform(3, 5.5)
            print(f"  - 滾動完成，等待 {scroll_pause_time:.2f} 秒讓內容加載...")
            time.sleep(scroll_pause_time)

        try:
            for req in driver.requests:
                # 跑過的略過，如果有 del driver.requests 可以刪掉
                if req.id in processed_request_ids:
                    continue
                else:
                    processed_request_ids.add(req.id)

                if req.url.startswith("https://www.instagram.com/graphql/query") and \
                    'xdt_api__v1__feed__user_timeline_graphql_connection' in req.headers['x-root-field-name']:
                    packet_count += 1
                    print(f"\n第 {packet_count} 個 feed 封包... (已獲取 {len(all_posts)}/{num_posts_to_fetch} 篇)")

                    response_body = decode(req.response.body, req.response.headers.get('Content-Encoding', 'identity'))
                    response_text = response_body.decode('utf-8') 

                    data = json.loads(response_text)
                    save_json_no_overwrite(data, f"../raw_data/{target_username}_response_text.json")

                    feed_data = data.get('data', {}).get('xdt_api__v1__feed__user_timeline_graphql_connection', {})
                    edges = feed_data.get('edges', [])
                    
                    if not edges:
                        print("  - API 回應中未找到貼文，可能已無更多內容。")
                        break

                    new_posts_found = 0
                    for edge in edges:
                        node = edge.get('node', {})
                        if not node:
                            continue
                        post_id = node.get('id')
                        if not post_id or post_id in processed_post_ids:
                            continue
                    
                        all_posts.append(node)
                        processed_post_ids.add(post_id)
                        new_posts_found += 1

                    print(f"  - 解析成功，本輪新增 {new_posts_found} 篇貼文。總數: {len(all_posts)}。")
                    
                    if len(all_posts) >= num_posts_to_fetch:
                        break

        except Exception as e:
            print(f"  - 出錯: {e}")
        
        scroll_attempts += 1

    time.sleep(random.uniform(3, 6))
    # input("[Enter] to continue.\n")
    driver.quit()
    
    final_posts = all_posts#[:num_posts_to_fetch]
    print(f"\n--- 抓取完成！成功獲取 {len(final_posts)} 篇貼文 ---")
    return final_posts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="抓取指定 Instagram 用戶貼文")
    parser.add_argument("username", type=str, help="目標 Instagram 用戶名稱")
    parser.add_argument("-n", "--num-posts", type=int, default=20, help="希望抓取的貼文數量")
    args = parser.parse_args()

    TARGET_USERNAME = args.username
    POSTS_TO_FETCH = args.num_posts

    credentials = load_selenium_credentials("ins_cred_se_manual.json")
    if not credentials:
        sys.exit(1)

    try:
        latest_posts = get_user_posts(TARGET_USERNAME, POSTS_TO_FETCH, credentials, 50)
        save_posts_as_individual_files(latest_posts, TARGET_USERNAME)
            
    except WebDriverException as e:
        print(f"\n發生 WebDriver 錯誤，可能是瀏覽器或驅動程式問題: {e}")
    except Exception as e:
        print(f"\n發生未預期的錯誤: {e}")