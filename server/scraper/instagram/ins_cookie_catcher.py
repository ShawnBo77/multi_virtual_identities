import json
import time
import random
import getpass

from selenium import webdriver
from selenium.webdriver.firefox.service import Service as FirefoxService
from webdriver_manager.firefox import GeckoDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

USERNAME_LOCATORS = [
    (By.NAME, "username"),
    (By.NAME, "email"),
    (By.NAME, "phoneNumber"),
    (By.CSS_SELECTOR, "input[autocomplete='username webauthn']"),
    (By.XPATH, "//input[@type='text' and @name='email']"),
    (By.XPATH, "//label[contains(., 'username') or contains(., 'email')]/preceding-sibling::input"),
]

PASSWORD_LOCATORS = [
    (By.NAME, "password"),
    (By.NAME, "pass"),
    (By.CSS_SELECTOR, "input[type='password']"),
    (By.XPATH, "//input[contains(@aria-label, 'Password')]"),
]


LOGIN_LOCATORS = [
    (By.XPATH, "//div[@role='button'][contains(., 'Log in')]"),
    (By.XPATH, "//div[@role='button'][contains(., 'Log In')]"),
    (By.XPATH, "//button[@type='submit']"),
    (By.XPATH, "//*[contains(text(), 'Log in') or contains(text(), 'Log In')]"),
]


def type_like_human(element, text):
    """
    Simulates human typing behavior with random delays between keystrokes.
    """
    for char in text:
        element.send_keys(char)
        delay = random.uniform(0.05, 0.15)
        time.sleep(delay)


def find_element(wait, locators):
    for by_method, pattern in locators:
        try:
            element = wait.until(EC.presence_of_element_located((by_method, pattern)))
            return element
        except Exception:
            continue
    raise Exception(f"Element not found using locators: {locators}")


def extract_cookies(driver):
    """
    Extracts cookies from the current driver session and returns them as a dictionary.
    """
    print("[System] Extracting cookies...")

    cookies_for_selenium = driver.get_cookies()

    # Check for critical session cookies
    critical_cookies = ["sessionid", "ds_user_id", "csrftoken", "rur", "datr", "mid", "ig_did", "wd"]
    cookies_names_set = {c["name"] for c in cookies_for_selenium}
    missing_cookies = [name for name in critical_cookies if name not in cookies_names_set]

    if missing_cookies:
        print("[Warning] Not all critical cookies were found.")
        print(f"  - Missing: {', '.join(missing_cookies)}")
    else:
        print("[Success] Critical cookies extracted successfully.")

    user_agent = driver.execute_script("return navigator.userAgent;")

    # Construct the return data structure
    credentials_data = {
        "user_agent": user_agent,
        "cookie_string": "; ".join([f"{c['name']}={c['value']}" for c in cookies_for_selenium]),
        "cookies_for_selenium": cookies_for_selenium,
    }

    return credentials_data


def manual_login(reason="Unknown Issue"):
    """
    Pauses the script and asks the user to manually resolve issues in the browser.
    """
    print("\n" + "!" * 60)
    print(f"login Failed: {reason}")
    print("Action needed:")
    print("  1. Go to the Firefox window.")
    print("  2. Ensure you are fully logged in and can see the Instagram Home feed.")
    print("!" * 60)

    # Block until user presses Enter
    input(">>> Once you are on the Home page, press [Enter] here to continue <<<")
    print("[System] Resuming script... Checking for Home page again...")


def manual_login_brief():
    input(">>> Ensure you login successfully, and press [Enter] here to continue <<<")
    print("[System] Resuming script...")


def can_find_logo(driver):
    """
    Checks login status by looking for Home page elements.
    """
    try:
        logo_indicator_xpath = "//*[name()='svg'][@aria-label='Instagram' or .//*[text()='Instagram']]"
        WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.XPATH, logo_indicator_xpath)))
        return True
    except Exception:
        return False


def check_login_status(driver):
    current_url_lower = driver.current_url.lower()
    fail_keywords = ["login", "challenge", "two_factor", "checkpoint", "suspend", "consent", "contact", "reset"]

    for keyword in fail_keywords:
        if keyword.lower() in current_url_lower:
            print(f"[Status] URL still contains '{keyword.lower()}'. Login likely not finished yet.")
            return False

    print("[Status] URL changed (Not login page). Navigating to Home...")
    if current_url_lower != "https://www.instagram.com/":
        driver.get("https://www.instagram.com/")
    if can_find_logo(driver):
        return True
    else:
        return False


def login_and_get_cookies(username, password, headless=False):
    print(f"\n--- Starting Instagram Login for user: {username} ---")

    options = webdriver.FirefoxOptions()
    if headless:
        options.add_argument("--headless")

    # Anti-detection settings
    options.set_preference("dom.webdriver.enabled", False)
    options.set_preference("useAutomationExtension", False)
    options.set_preference("intl.accept_languages", "en-US, en")

    driver = webdriver.Firefox(service=FirefoxService(GeckoDriverManager().install()), options=options)
    driver.set_window_size(random.randint(1024, 1280), random.randint(768, 900))

    wait = WebDriverWait(driver, 5)
    result_data = None
    login_success = False

    try:
        print("[System] Navigating to login page...")
        driver.get("https://www.instagram.com/accounts/login/")

        try:
            # Fill Credentials
            username_input = find_element(wait, USERNAME_LOCATORS)
            password_input = find_element(wait, PASSWORD_LOCATORS)

            time.sleep(random.uniform(1.5, 2))
            type_like_human(username_input, username)
            time.sleep(random.uniform(0.5, 1))
            type_like_human(password_input, password)
            time.sleep(random.uniform(1, 2))

            # Click login button
            login_button = find_element(wait, LOGIN_LOCATORS)
            wait.until(EC.visibility_of(login_button))
            login_button.click()
            print("[Action] Login button clicked. Waiting for response...")
            time.sleep(random.uniform(5, 10))
            login_success = check_login_status(driver)
        except Exception as e:
            manual_login(reason=e)

        while not login_success:
            try:
                login_success = check_login_status(driver)
                if not login_success:
                    manual_login_brief()
                else:
                    login_success = True
                    print("[Success] Logged in successfully.")
                    break
            except Exception as e:
                manual_login(reason=e)

        if login_success:
            result_data = extract_cookies(driver)

            if result_data:
                filename = f"ins_cred_{username}.json"
                with open(filename, "w", encoding="utf-8") as f:
                    json.dump(result_data, f, ensure_ascii=False, indent=4)
                print(f"[System] Saved to {filename}")
        else:
            print("[Fail] Login process failed. No cookies saved.")

    except Exception as e:
        print(f"\n[Error] An unexpected error occurred: {e}")
        # driver.save_screenshot("error_snapshot.png")
    finally:
        print("--- Closing Browser ---")
        driver.quit()

    return result_data


if __name__ == "__main__":
    my_user = input("Username: ")
    my_pass = getpass.getpass("Password: ")

    login_and_get_cookies(my_user, my_pass)
