from app.config import get_settings

def check_keys():
    settings = get_settings()
    if settings.supabase_anon_key == settings.supabase_service_role_key:
        print("ISSUE DETECTED: SUPABASE_ANON_KEY is identical to SUPABASE_SERVICE_ROLE_KEY.")
        print("Please update SUPABASE_SERVICE_ROLE_KEY in backend/.env with the correct 'service_role' key from Supabase.")
    else:
        print("Keys are different. Good.")
        print(f"Anon key starts with: {settings.supabase_anon_key[:5]}...")
        print(f"Service key starts with: {settings.supabase_service_role_key[:5]}...")

if __name__ == "__main__":
    check_keys()
