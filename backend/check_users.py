import asyncio
from app.database import get_supabase_admin

async def check_users():
    admin_client = get_supabase_admin()
    response = admin_client.table("users").select("*").execute()
    print("Users in public table:")
    for user in response.data:
        print(f"- {user['email']} (ID: {user['id']})")

if __name__ == "__main__":
    asyncio.run(check_users())
