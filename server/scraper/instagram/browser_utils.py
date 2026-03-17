import time
import random
from selenium.webdriver.common.by import By

FAIL_KEYWORDS = ["login", "challenge", "two_factor", "checkpoint", "suspend", "consent", "contact", "reset"]

USERNAME_LOCATORS = [
    (By.NAME, "username"),
    (By.NAME, "email"),
    (By.NAME, "phoneNumber"),
    (By.CSS_SELECTOR, "input[autocomplete='username webauthn']"),
    (By.XPATH, "//input[@type='text' and @name='email']"),
    (By.XPATH, "//label[contains(., 'username') or contains(., 'email')]/preceding-sibling::input"),
]


def _is_login_input_present(driver) -> bool:
    """
    Checks if any login input fields are visible on the page.
    Iterates through multiple locators to ensure robustness against UI changes.
    """
    for by_method, pattern in USERNAME_LOCATORS:
        try:
            elements = driver.find_elements(by_method, pattern)
            for element in elements:
                if element.is_displayed():
                    # print(f"[Background] Debug: Login input found via {pattern}")
                    return True
        except Exception:
            continue
    return False


def verify_login_status(driver) -> bool:
    """
    Checks URL keywords, presence of login inputs, and navigation elements.
    """
    try:
        time.sleep(random.uniform(3, 5))
        driver.get("https://www.instagram.com/")

        # Wait for redirects
        time.sleep(random.uniform(5, 8))

        # Check URL for failure keywords
        current_url = driver.current_url.lower()
        for keyword in FAIL_KEYWORDS:
            if keyword in current_url:
                print(f"[Background] ✗ Login failed: URL contains '{keyword}'")
                return False

        # Check if login form exists
        if _is_login_input_present(driver):
            print("[Background] ✗ Login failed: Login input fields are visible.")
            return False

        return True

    except Exception as e:
        print(f"[Background] Error during login verification: {e}")
        return False
