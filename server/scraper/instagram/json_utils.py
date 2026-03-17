def extract_media_payload(raw_data: dict) -> dict:
    """
    Standardizes different Instagram JSON structures into a flat media payload.
    Handles:
    1. Home Feed Nodes (nested under 'media', 'ad', or 'explore_story')
    2. Profile Posts
    """
    if "media" in raw_data and raw_data["media"]:
        return raw_data["media"]

    if "ad" in raw_data and raw_data["ad"] and raw_data["ad"].get("items"):
        return raw_data["ad"]["items"][0]

    if "explore_story" in raw_data and raw_data["explore_story"] and raw_data["explore_story"].get("media"):
        return raw_data["explore_story"]["media"]

    return raw_data
