"""
Google Apps Script Integration Client for Google Colab
Production-ready data submission with retry logic, error handling, and authentication support.

Usage:
    1. Set GAS_WEBAPP_URL in Colab Secrets
    2. Import and use GASClient class
    3. Call post_data() with your payload

Example:
    from colab_integration import GASClient, Config
    
    client = GASClient(Config.get_webapp_url())
    result = client.post_data({"id": 1, "result": "test", "score": 100})
"""

import os
import json
import time
import requests
from typing import Dict, Any, Optional, List

# ===================================================================
# CONFIGURATION
# ===================================================================

class Config:
    """Configuration management using environment variables and Colab secrets."""
    
    @staticmethod
    def get_webapp_url() -> str:
        """
        Retrieve Web App URL from Colab Secrets or environment variables.
        
        Returns:
            str: The Google Apps Script Web App URL
            
        Raises:
            ValueError: If URL is not configured
        """
        url = None
        
        # Try Colab userdata first (Colab Secrets)
        try:
            from google.colab import userdata
            url = userdata.get('GAS_WEBAPP_URL')
        except ImportError:
            pass  # Not running in Colab
        except Exception:
            pass  # Secret not found or other error
        
        # Fallback to environment variable
        if not url:
            url = os.getenv('GAS_WEBAPP_URL')
        
        if not url:
            raise ValueError(
                "GAS_WEBAPP_URL not configured!\n"
                "Set it in:\n"
                "  - Colab Secrets (🔑 icon in left sidebar), or\n"
                "  - Environment variable: export GAS_WEBAPP_URL=your_url"
            )
        
        return url
    
    @staticmethod
    def get_auth_token() -> Optional[str]:
        """
        Get OAuth token for authenticated requests (Colab only).
        
        Returns:
            Optional[str]: Bearer token if authentication succeeds, None otherwise
        """
        try:
            from google.colab import auth
            import google.auth
            from google.auth.transport.requests import Request
            
            auth.authenticate_user()
            creds, _ = google.auth.default()
            
            if not creds.valid:
                creds.refresh(Request())
            
            return creds.token
        except ImportError:
            return None  # Not in Colab
        except Exception as e:
            print(f"⚠️ Authentication failed: {e}")
            return None


# ===================================================================
# HTTP CLIENT
# ===================================================================

class GASClient:
    """
    Client for Google Apps Script Web App API.
    
    Handles HTTP communication with retry logic, authentication, and
    proper redirect handling for GAS web apps.
    
    Attributes:
        webapp_url: Full URL to deployed GAS Web App
        max_retries: Maximum retry attempts for failed requests
        timeout: Request timeout in seconds
        auth_token: Optional OAuth bearer token for authenticated requests
    """
    
    def __init__(
        self, 
        webapp_url: str, 
        max_retries: int = 3, 
        timeout: int = 30,
        use_auth: bool = False
    ):
        """
        Initialize GAS client.
        
        Args:
            webapp_url: Full URL to deployed GAS Web App
            max_retries: Maximum retry attempts for failed requests
            timeout: Request timeout in seconds
            use_auth: Whether to attempt OAuth authentication (Colab only)
        """
        self.webapp_url = webapp_url
        self.max_retries = max_retries
        self.timeout = timeout
        self.auth_token = Config.get_auth_token() if use_auth else None
        
        if self.auth_token:
            print(f"🔐 Authenticated mode enabled")
    
    def post_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send data to GAS with retry logic and proper redirect handling.
        
        The GAS web app returns a 302 redirect to googleusercontent.com
        which must be followed with a GET request (not POST).
        
        Args:
            data: Dictionary containing id, result, score
            
        Returns:
            Response dictionary with status and metadata
            
        Raises:
            requests.exceptions.RequestException: If all retries fail
            ValueError: If data validation fails
        """
        # Validate required fields
        required_fields = ['id', 'result', 'score']
        missing = [f for f in required_fields if f not in data]
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")
        
        headers = {'Content-Type': 'application/json'}
        if self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'
        
        for attempt in range(self.max_retries):
            try:
                print(f"📤 Attempt {attempt + 1}/{self.max_retries}: Sending data...")
                
                # Initial POST request (don't auto-follow redirects)
                response = requests.post(
                    self.webapp_url,
                    data=json.dumps(data),
                    headers=headers,
                    timeout=self.timeout,
                    allow_redirects=False
                )
                
                # Handle redirect (GAS always redirects to googleusercontent.com)
                if response.status_code == 302:
                    redirect_url = response.headers.get('Location', '')
                    print(f"   ↪️ Following redirect...")
                    
                    # Check for auth block (redirect to login page)
                    if 'accounts.google.com' in redirect_url:
                        raise ValueError(
                            "🚨 Access denied: Redirected to login page.\n"
                            "Your organization may be blocking anonymous access.\n"
                            "Try using authenticated mode: GASClient(..., use_auth=True)"
                        )
                    
                    # Follow redirect with GET (not POST) and no auth headers
                    response = requests.get(
                        redirect_url,
                        timeout=self.timeout
                    )
                
                # Check final response
                response.raise_for_status()
                result = response.json()
                
                if result.get('status') == 'success':
                    print(f"✅ Success! Data written to row {result.get('row')}")
                    print(f"⏱️  Execution time: {result.get('executionTime', 'N/A')}s")
                    return result
                else:
                    error_msg = result.get('message', 'Unknown error')
                    print(f"⚠️ Server error: {error_msg}")
                    
                    # Don't retry client errors
                    if result.get('code') in ['INVALID_JSON', 'MISSING_FIELDS']:
                        raise ValueError(f"Validation error: {error_msg}")
                    
                    if attempt < self.max_retries - 1:
                        self._wait_before_retry(attempt)
                    else:
                        return result
                        
            except requests.exceptions.Timeout:
                print(f"⏰ Request timed out after {self.timeout}s")
                if attempt < self.max_retries - 1:
                    self._wait_before_retry(attempt)
                else:
                    raise
                    
            except requests.exceptions.HTTPError as e:
                print(f"❌ HTTP Error {response.status_code}")
                if attempt < self.max_retries - 1 and response.status_code >= 500:
                    self._wait_before_retry(attempt)
                else:
                    raise
                    
            except requests.exceptions.RequestException as e:
                print(f"❌ Request failed: {str(e)}")
                if attempt < self.max_retries - 1:
                    self._wait_before_retry(attempt)
                else:
                    raise
        
        raise requests.exceptions.RequestException("All retry attempts failed")
    
    def post_batch(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Send multiple data items to GAS sequentially.
        
        Args:
            items: List of data dictionaries
            
        Returns:
            List of response dictionaries
        """
        results = []
        for i, item in enumerate(items):
            print(f"\n📦 Processing item {i + 1}/{len(items)}...")
            try:
                result = self.post_data(item)
                results.append(result)
            except Exception as e:
                results.append({
                    'status': 'error',
                    'message': str(e),
                    'item': item
                })
        
        # Summary
        success_count = sum(1 for r in results if r.get('status') == 'success')
        print(f"\n📊 Batch complete: {success_count}/{len(items)} successful")
        
        return results
    
    def _wait_before_retry(self, attempt: int):
        """Exponential backoff between retries."""
        wait_time = 2 ** attempt
        print(f"⏳ Waiting {wait_time}s before retry...")
        time.sleep(wait_time)
    
    def test_connection(self) -> bool:
        """
        Test connection to GAS endpoint with a dummy payload.
        
        Returns:
            True if connection successful, False otherwise
        """
        print("🔍 Testing connection to GAS Web App...")
        print(f"📍 URL: {self.webapp_url[:50]}...")
        
        test_payload = {
            "id": 0,
            "result": "Connection Test",
            "score": 0
        }
        
        try:
            response = requests.post(
                self.webapp_url,
                data=json.dumps(test_payload),
                headers={'Content-Type': 'application/json'},
                timeout=15,
                allow_redirects=True
            )
            
            print(f"📡 Status Code: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    result = response.json()
                    print(f"📦 Response: {json.dumps(result, indent=2)}")
                    
                    if result.get('status') == 'success':
                        print("🎉 Connection test PASSED!")
                        return True
                    else:
                        print(f"⚠️ Server returned: {result.get('message')}")
                        return False
                except json.JSONDecodeError:
                    print("⚠️ Response is not valid JSON")
                    print(f"   Body preview: {response.text[:200]}")
                    return False
            else:
                print(f"❌ Non-200 status code")
                return False
                
        except Exception as e:
            print(f"❌ Connection test FAILED: {str(e)}")
            self._print_troubleshooting()
            return False
    
    def _print_troubleshooting(self):
        """Print troubleshooting checklist."""
        print("\n💡 Troubleshooting checklist:")
        print("  1. Is the Web App URL correct? (should end with /exec)")
        print("  2. Is Web App access set to 'Anyone'?")
        print("  3. Does 'Processed_Data' sheet exist?")
        print("  4. Is the Apps Script deployment active?")
        print("  5. Check Apps Script execution logs for errors")


# ===================================================================
# MAIN USAGE
# ===================================================================

def main():
    """Example usage of GASClient."""
    
    print("=" * 50)
    print("  TRI-STATE DASHBOARD - Python Integration")
    print("=" * 50 + "\n")
    
    # Get configuration
    try:
        webapp_url = Config.get_webapp_url()
    except ValueError as e:
        print(f"❌ Configuration Error:\n{str(e)}")
        return
    
    # Initialize client
    client = GASClient(webapp_url)
    
    # Test connection first
    if not client.test_connection():
        print("\n❌ Aborting: Connection test failed")
        return
    
    # Example: Single data submission
    print("\n" + "=" * 50)
    print("  SINGLE SUBMISSION TEST")
    print("=" * 50 + "\n")
    
    sample_data = {
        "id": 101,
        "result": "Optimization Complete - Python Integration",
        "score": 98.5
    }
    
    try:
        result = client.post_data(sample_data)
        if result.get('status') == 'success':
            print("\n✅ Single submission successful!")
    except Exception as e:
        print(f"\n❌ Submission failed: {str(e)}")
    
    # Example: Batch submission
    print("\n" + "=" * 50)
    print("  BATCH SUBMISSION TEST")
    print("=" * 50)
    
    batch_data = [
        {"id": 201, "result": "Batch Item 1", "score": 85},
        {"id": 202, "result": "Batch Item 2", "score": 92},
        {"id": 203, "result": "Batch Item 3", "score": 78}
    ]
    
    try:
        results = client.post_batch(batch_data)
    except Exception as e:
        print(f"\n❌ Batch submission failed: {str(e)}")


# Run if executed directly
if __name__ == "__main__":
    main()
