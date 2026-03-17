import csv
import os
from datetime import datetime


def log_home_feed_relationship(log_dir, cred_username, post_pk, author_pk):
    """
    Logs the relationship between a credential and a discovered post to a flat file.
    """
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "home_feed_discovery.csv")

    file_exists = os.path.isfile(log_path)

    with open(log_path, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "credential_username", "post_pk", "author_pk"])

        writer.writerow([datetime.utcnow().isoformat(), cred_username, post_pk, author_pk])
