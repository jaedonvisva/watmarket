import asyncio
from app.database import get_supabase_admin

async def find_auth_user():
    admin_client = get_supabase_admin()
    # supabase-py admin client usage for listing users
    # Note: list_users might be paginated
    try:
        response = admin_client.auth.admin.list_users()
        print("Auth Users:")
        for user in response:
            print(f"- {user.email} (ID: {user.id})")
    except Exception as e:
        print(f"Error listing users: {e}")

if __name__ == "__main__":
    asyncio.run(find_auth_user())
