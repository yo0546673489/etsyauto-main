"""
Tests for Sentry PII and Secret Scrubbing
Validates that sensitive data is properly redacted
"""
import pytest
from app.core.sentry_config import (
    scrub_sensitive_data,
    scrub_pii,
    scrub_all,
    before_send
)


class TestSensitiveDataScrubbing:
    """Test sensitive data (secrets, tokens, passwords) scrubbing"""
    
    def test_password_redaction(self):
        """Test that passwords are redacted"""
        data = {'username': 'john', 'password': 'secret123'}
        scrubbed = scrub_sensitive_data(data)
        assert scrubbed['password'] == '[REDACTED]'
        assert scrubbed['username'] == 'john'
    
    def test_token_redaction(self):
        """Test that all token types are redacted"""
        data = {
            'access_token': 'eyJhbGci...',
            'refresh_token': 'refresh_abc',
            'api_key': 'sk-1234',
            'bearer': 'Bearer token',
            'safe_value': 'keep this'
        }
        scrubbed = scrub_sensitive_data(data)
        
        assert scrubbed['access_token'] == '[REDACTED]'
        assert scrubbed['refresh_token'] == '[REDACTED]'
        assert scrubbed['api_key'] == '[REDACTED]'
        assert scrubbed['bearer'] == '[REDACTED]'
        assert scrubbed['safe_value'] == 'keep this'
    
    def test_nested_secrets(self):
        """Test that nested secrets are redacted"""
        data = {
            'user': {
                'credentials': {
                    'password': 'secret',
                    'api_key': 'key123'
                },
                'user_id': '123'  # Safe field
            }
        }
        scrubbed = scrub_sensitive_data(data)
        # 'credentials' key contains 'credential' (sensitive), so entire object redacted
        assert scrubbed['user']['credentials'] == '[REDACTED]'
        assert scrubbed['user']['user_id'] == '123'  # Safe field remains
    
    def test_list_secrets(self):
        """Test that secrets in lists are redacted"""
        data = {
            'items': [  # Use 'items' instead of 'tokens' (tokens is sensitive)
                {'token': 'abc123', 'value': 100},
                {'token': 'def456', 'value': 200}
            ]
        }
        scrubbed = scrub_sensitive_data(data)
        assert scrubbed['items'][0]['token'] == '[REDACTED]'
        assert scrubbed['items'][1]['token'] == '[REDACTED]'
        assert scrubbed['items'][0]['value'] == 100


class TestPIIScrubbing:
    """Test PII (Personally Identifiable Information) scrubbing"""
    
    def test_email_scrubbing(self):
        """Test that emails are scrubbed"""
        data = {'email': 'user@example.com', 'user_id': '123'}
        scrubbed = scrub_pii(data)
        assert scrubbed['email'] == '[PII]'
        assert scrubbed['user_id'] == '123'
    
    def test_name_scrubbing(self):
        """Test that names are scrubbed"""
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'full_name': 'John Doe',
            'username': 'johndoe123'  # Contains 'name' so will be scrubbed
        }
        scrubbed = scrub_pii(data)
        assert scrubbed['first_name'] == '[PII]'
        assert scrubbed['last_name'] == '[PII]'
        assert scrubbed['full_name'] == '[PII]'
        assert scrubbed['username'] == '[PII]'  # Contains 'name' so it's scrubbed (conservative)
    
    def test_address_scrubbing(self):
        """Test that addresses and location data are scrubbed"""
        data = {
            'address': '123 Main St',
            'zip': '12345',
            'ip_address': '192.168.1.1',
            'city': 'New York'  # 'city' not in PII_KEYS, so safe
        }
        scrubbed = scrub_pii(data)
        assert scrubbed['address'] == '[PII]'
        assert scrubbed['zip'] == '[PII]'
        assert scrubbed['ip_address'] == '[PII]'
        assert scrubbed['city'] == 'New York'
    
    def test_payment_data_scrubbing(self):
        """Test that payment data is scrubbed"""
        data = {
            'credit_card': '4532-1111-2222-3333',
            'card_number': '4532111122223333',
            'cvv': '123',
            'amount': 5000  # amount is safe
        }
        scrubbed = scrub_pii(data)
        assert scrubbed['credit_card'] == '[PII]'
        assert scrubbed['card_number'] == '[PII]'
        assert scrubbed['cvv'] == '[PII]'
        assert scrubbed['amount'] == 5000


class TestComprehensiveScrubbing:
    """Test scrub_all function (both secrets and PII)"""
    
    def test_scrub_all_function(self):
        """Test that scrub_all removes both secrets and PII"""
        data = {
            'email': 'user@example.com',  # PII
            'password': 'secret123',  # Secret
            'first_name': 'John',  # PII
            'api_key': 'sk-test',  # Secret
            'tenant_id': '123',  # Safe
            'value': 100  # Safe
        }
        
        scrubbed = scrub_all(data)
        
        # Both PII and secrets should be redacted
        assert scrubbed['email'] == '[PII]'
        assert scrubbed['password'] == '[REDACTED]'
        assert scrubbed['first_name'] == '[PII]'
        assert scrubbed['api_key'] == '[REDACTED]'
        
        # Safe fields remain
        assert scrubbed['tenant_id'] == '123'
        assert scrubbed['value'] == 100
    
    def test_mixed_nested_data(self):
        """Test scrubbing mixed nested data"""
        data = {
            'user': {
                'display_name': 'John Doe',  # Contains 'name' - PII
                'email': 'john@example.com',  # PII
                'auth': {  # 'auth' is sensitive key, entire object redacted
                    'password': 'secret',
                    'token': 'abc123'
                },
                'user_id': '789'  # Safe
            },
            'metadata': {
                'ip_address': '1.2.3.4',  # PII
                'tenant_id': '456'  # Safe
            }
        }
        
        scrubbed = scrub_all(data)
        
        assert scrubbed['user']['display_name'] == '[PII]'  # Contains 'name'
        assert scrubbed['user']['email'] == '[PII]'
        # 'auth' key is sensitive, so entire nested object is redacted
        assert scrubbed['user']['auth'] == '[REDACTED]'
        assert scrubbed['user']['user_id'] == '789'
        assert scrubbed['metadata']['ip_address'] == '[PII]'
        assert scrubbed['metadata']['tenant_id'] == '456'


class TestSentryEventScrubbing:
    """Test Sentry event scrubbing before send"""
    
    def test_request_data_scrubbed(self):
        """Test that request data is scrubbed"""
        event = {
            'request': {
                'data': {
                    'username': 'test',
                    'password': 'secret'
                },
                'headers': {
                    'Authorization': 'Bearer token123',
                    'Content-Type': 'application/json'
                }
            }
        }
        
        scrubbed = before_send(event, {})
        
        assert scrubbed['request']['data']['password'] == '[REDACTED]'
        assert scrubbed['request']['headers']['Authorization'] == '[REDACTED]'
        assert scrubbed['request']['headers']['Content-Type'] == 'application/json'
    
    def test_extra_context_scrubbed(self):
        """Test that extra context is scrubbed"""
        event = {
            'extra': {
                'api_key': 'sk-test',
                'contact_email': 'user@example.com',  # Contains 'email'
                'tenant_id': '123'
            }
        }
        
        scrubbed = before_send(event, {})
        
        assert scrubbed['extra']['api_key'] == '[REDACTED]'
        assert scrubbed['extra']['contact_email'] == '[PII]'  # Contains 'email'
        assert scrubbed['extra']['tenant_id'] == '123'
    
    def test_breadcrumbs_scrubbed(self):
        """Test that breadcrumbs are scrubbed"""
        event = {
            'breadcrumbs': [
                {
                    'message': 'API call',
                    'data': {
                        'url': '/api/products',
                        'headers': {
                            'Authorization': 'Bearer secret',
                            'Content-Type': 'application/json'
                        }
                    }
                }
            ]
        }
        
        scrubbed = before_send(event, {})
        
        assert scrubbed['breadcrumbs'][0]['data']['headers']['Authorization'] == '[REDACTED]'
        assert scrubbed['breadcrumbs'][0]['data']['headers']['Content-Type'] == 'application/json'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

