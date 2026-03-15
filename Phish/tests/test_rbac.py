import requests
import time

BASE_URL = "http://localhost:8002"

def register(username, password, role):
    resp = requests.post(f"{BASE_URL}/auth/register", json={
        "username": username,
        "password": password,
        "role": role
    })
    return resp

def login(username, password):
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "username": username,
        "password": password
    })
    return resp.json()

def test_rbac():
    # 1. Register users
    users = [
        ("free_user", "pass123", "free"),
        ("biz_user", "pass123", "business"),
        ("gov_user", "pass123", "gov"),
        ("admin_user", "pass123", "admin_gov")
    ]
    
    tokens = {}
    for u, p, r in users:
        register(u, p, r)
        tokens[r] = login(u, p)["access_token"]
    
    # 2. Test Endpoints
    tests = [
        # (endpoint, method, payload, allowed_roles)
        ("/v1/check/url", "POST", {"url": "http://example.com"}, ["free", "business", "gov", "admin_gov"]),
        ("/v1/ai/scan", "POST", {"urls": ["http://example.com"]}, ["free", "business", "gov", "admin_gov"]),
        ("/analyze_payment", "POST", {"url": "http://example.com", "html_snippet": "test"}, ["free", "business", "gov", "admin_gov"]),
        ("/v1/scan/secrets", "POST", {"url": "http://example.com"}, ["gov", "admin_gov"]),
        ("/v1/vuln/portscan", "POST", {"url": "http://example.com"}, ["gov", "admin_gov"]),
        ("/admin/users", "GET", None, ["admin_gov"]),
    ]
    
    for endpoint, method, payload, allowed in tests:
        print(f"\nTesting {endpoint}...")
        for role, token in tokens.items():
            headers = {"Authorization": f"Bearer {token}"}
            if method == "POST":
                r = requests.post(f"{BASE_URL}{endpoint}", json=payload, headers=headers)
            else:
                r = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
            
            expected = 200 if role in allowed else 403
            # AI scan might return 200 even if it fails internally, but we check 403 specifically
            if r.status_code == 403:
                status = "DENIED (Expected for 403)" if role not in allowed else "FAILED (Should be allowed)"
            elif r.status_code in [200, 201]:
                status = "ALLOWED (Expected for 200/201)" if role in allowed else "FAILED (Should be denied)"
            else:
                status = f"STATUS {r.status_code}"
            
            print(f"  Role {role:10}: {status}")

if __name__ == "__main__":
    time.sleep(2) # wait for server
    test_rbac()
