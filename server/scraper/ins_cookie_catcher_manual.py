import json
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
    Extracts cookies from the Selenium driver and saves them.
    """
    print("\nExtracting cookies...")

    cookies_for_selenium = driver.get_cookies()

    # Check if the cookies are complete
    critical_cookies = ["sessionid", "ds_user_id", "csrftoken", "rur", "datr", "mid", "ig_did", "wd"]

    cookies_names_set = {c["name"] for c in cookies_for_selenium}

    missing_cookies = []
    for critical_name in critical_cookies:
        if critical_name not in cookies_names_set:
            missing_cookies.append(critical_name)

    if missing_cookies:
        print("Error: Failed to retrieve all critical cookies.")
        print(f"  - Missing cookies: {', '.join(missing_cookies)}")
    else:
        print("Cookies extracted successfully!")

    credentials_data = {
        "user_agent": driver.execute_script("return navigator.userAgent;"),
        "cookie_string": "; ".join([f"{c['name']}={c['value']}" for c in cookies_for_selenium]),
        "cookies_for_selenium": cookies_for_selenium,
    }

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(credentials_data, f, ensure_ascii=False, indent=4)

    print(f"\nCredentials have been successfully saved to '{filename}'.")
    return True


def manual_login_and_save_cookies(filename):
    """
    Starts the browser and waits for the user to log in manually, then saves the cookies.
    """
    print("--- Starting Firefox browser ---")
    service = FirefoxService(GeckoDriverManager().install())
    options = webdriver.FirefoxOptions()

    driver = webdriver.Firefox(service=service, options=options)
    wait = WebDriverWait(driver, 300)  # Give the user ample time to log in (300 seconds = 5 minutes)

    try:
        # Navigate to the login page
        driver.get("https://www.instagram.com/accounts/login/")
        print("=" * 60)
        print("The browser has been opened. Please complete the following actions in the browser:")
        print("  1. Enter your username and password.")
        print("  2. Confirm that you have successfully logged in and can see the Instagram main page.")
        print("\nOnce you are done, please return to this terminal window and press the [Enter] key to continue...")
        print("=" * 60)

        # Pause the script and wait for user input
        while True:
            # Block the script until the user presses Enter
            input()

            print("\nUser action detected, verifying login status...")

            # Verify if the login was successful by checking the URL.
            if "accounts/login" in driver.current_url:
                print("\n[!] ERROR: You still seem to be on the login page.")
                print("Please complete the login in the browser and then press [Enter] here to try again.")
            else:
                break

        # Double-check for the presence of a landmark element on the main page
        logo_indicator_xpath = "//*[name()='svg' and @aria-label='Instagram']"
        wait.until(EC.visibility_of_element_located((By.XPATH, logo_indicator_xpath)))
        print("--- Login confirmed successfully! ---")

        # Save the cookies
        if not save_selenium_credentials_to_json(driver, filename):
            print("Failed to save cookies.")

    except TimeoutException:
        print("\nError: Timed out waiting for the main page element.")
        driver.save_screenshot("login_timeout_error.png")
        print("  - An error screenshot has been saved to login_timeout_error.png")
    except Exception as e:
        print(f"\nAn unknown error occurred: {e}")
    finally:
        print("--- Script execution finished, closing the browser... ---")
        # input("Press [Enter] to terminate the process.\n")
        driver.quit()


if __name__ == "__main__":
    try:
        output_filename = "ins_cred_se_manual.json"
        manual_login_and_save_cookies(output_filename)
    except KeyboardInterrupt:
        print("\n\nOperation interrupted by user.")
        sys.exit(0)
