"""
Unit Tests for Policy Checks
Tests policy engine without external dependencies
"""
import pytest
from app.services.policy_engine import PolicyEngine, PolicyViolation


class TestPolicyEngine:
    """Unit tests for policy engine"""
    
    def setup_method(self):
        """Setup policy engine for each test"""
        self.engine = PolicyEngine()
    
    def test_handmade_requirement_pass(self):
        """Test that content with 'handmade' passes"""
        result = self.engine.check_handmade_requirement(
            title="Handmade Ceramic Mug",
            description="Beautiful handmade mug"
        )
        assert result.passed is True
        assert result.violations == []
    
    def test_handmade_requirement_fail(self):
        """Test that content without 'handmade' fails"""
        result = self.engine.check_handmade_requirement(
            title="Ceramic Mug",
            description="Beautiful mug for coffee"
        )
        assert result.passed is False
        assert len(result.violations) > 0
        assert result.violations[0].code == "MISSING_HANDMADE"
    
    def test_prohibited_terms_detection(self):
        """Test detection of prohibited terms"""
        prohibited_content = [
            ("replica watch", "prohibited_brand"),
            ("guaranteed results", "prohibited_claim"),
            ("cure cancer", "prohibited_medical"),
            ("best quality", "prohibited_superlative"),
        ]
        
        for content, expected_code in prohibited_content:
            result = self.engine.check_prohibited_terms(
                title=content,
                description=f"Product with {content}"
            )
            assert result.passed is False
            assert any(v.code == expected_code.upper() for v in result.violations)
    
    def test_title_length_limits(self):
        """Test title length validation"""
        # Valid title
        valid_title = "A" * 140
        result = self.engine.check_title_length(valid_title)
        assert result.passed is True
        
        # Too long
        long_title = "A" * 141
        result = self.engine.check_title_length(long_title)
        assert result.passed is False
        assert result.violations[0].code == "TITLE_TOO_LONG"
        
        # Too short
        short_title = ""
        result = self.engine.check_title_length(short_title)
        assert result.passed is False
        assert result.violations[0].code == "TITLE_REQUIRED"
    
    def test_description_length_limits(self):
        """Test description length validation"""
        # Valid description
        valid_desc = "A" * 5000
        result = self.engine.check_description_length(valid_desc)
        assert result.passed is True
        
        # Too long
        long_desc = "A" * 5001
        result = self.engine.check_description_length(long_desc)
        assert result.passed is False
        assert result.violations[0].code == "DESCRIPTION_TOO_LONG"
    
    def test_required_fields_validation(self):
        """Test that all required fields are present"""
        # All fields present
        result = self.engine.check_required_fields(
            title="Handmade Mug",
            description="Beautiful handmade ceramic mug",
            price=29.99,
            quantity=10
        )
        assert result.passed is True
        
        # Missing title
        result = self.engine.check_required_fields(
            title=None,
            description="Description",
            price=29.99,
            quantity=10
        )
        assert result.passed is False
        assert any(v.code == "MISSING_TITLE" for v in result.violations)
        
        # Missing price
        result = self.engine.check_required_fields(
            title="Title",
            description="Description",
            price=None,
            quantity=10
        )
        assert result.passed is False
        assert any(v.code == "MISSING_PRICE" for v in result.violations)
    
    def test_price_validation(self):
        """Test price range validation"""
        # Valid price
        result = self.engine.check_price_range(29.99)
        assert result.passed is True
        
        # Zero price
        result = self.engine.check_price_range(0.00)
        assert result.passed is False
        assert result.violations[0].code == "INVALID_PRICE"
        
        # Negative price
        result = self.engine.check_price_range(-10.00)
        assert result.passed is False
        
        # Too high price
        result = self.engine.check_price_range(50001.00)
        assert result.passed is False
    
    def test_quantity_validation(self):
        """Test quantity validation"""
        # Valid quantity
        result = self.engine.check_quantity(10)
        assert result.passed is True
        
        # Zero quantity
        result = self.engine.check_quantity(0)
        assert result.passed is False
        
        # Negative quantity
        result = self.engine.check_quantity(-5)
        assert result.passed is False
        
        # Too high quantity
        result = self.engine.check_quantity(100001)
        assert result.passed is False
    
    def test_tags_validation(self):
        """Test tags validation"""
        # Valid tags
        result = self.engine.check_tags(["handmade", "ceramic", "mug"])
        assert result.passed is True
        
        # Too many tags (max 13)
        result = self.engine.check_tags([f"tag{i}" for i in range(14)])
        assert result.passed is False
        assert result.violations[0].code == "TOO_MANY_TAGS"
        
        # Tag too long (max 20 chars)
        result = self.engine.check_tags(["a" * 21])
        assert result.passed is False
        assert result.violations[0].code == "TAG_TOO_LONG"
    
    def test_comprehensive_check(self):
        """Test comprehensive policy check"""
        # Compliant product
        result = self.engine.check_all(
            title="Handmade Ceramic Mug",
            description="Beautiful handmade ceramic mug perfect for coffee",
            price=29.99,
            quantity=10,
            tags=["handmade", "ceramic", "mug"]
        )
        assert result.passed is True
        assert result.critical_violations == []
        assert result.warning_violations == []
        
        # Non-compliant product
        result = self.engine.check_all(
            title="Replica Watch",  # Prohibited term
            description="Best quality watch guaranteed",  # Prohibited claims
            price=0.00,  # Invalid price
            quantity=-5,  # Invalid quantity
            tags=["tag"] * 14  # Too many tags
        )
        assert result.passed is False
        assert len(result.critical_violations) > 0
    
    def test_policy_severity_levels(self):
        """Test that violations have correct severity"""
        # Critical: prohibited terms
        result = self.engine.check_prohibited_terms(
            title="replica designer bag",
            description="guaranteed to cure"
        )
        assert all(v.severity == "critical" for v in result.violations)
        
        # Warning: missing handmade (can still publish with warning)
        result = self.engine.check_handmade_requirement(
            title="Ceramic Mug",
            description="Nice mug"
        )
        assert result.violations[0].severity == "warning"
    
    def test_case_insensitive_detection(self):
        """Test that policy checks are case-insensitive"""
        # Uppercase
        result = self.engine.check_prohibited_terms(
            title="REPLICA WATCH",
            description="GUARANTEED RESULTS"
        )
        assert result.passed is False
        
        # Mixed case
        result = self.engine.check_handmade_requirement(
            title="HaNdMaDe Mug",
            description="This is HaNdMaDe"
        )
        assert result.passed is True
    
    def test_policy_check_performance(self):
        """Test that policy checks are fast (< 100ms)"""
        import time
        
        start = time.time()
        for _ in range(100):
            self.engine.check_all(
                title="Handmade Ceramic Mug",
                description="Beautiful handmade ceramic mug",
                price=29.99,
                quantity=10,
                tags=["handmade", "ceramic"]
            )
        end = time.time()
        
        avg_time_ms = ((end - start) / 100) * 1000
        assert avg_time_ms < 100, f"Policy check too slow: {avg_time_ms:.2f}ms"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

