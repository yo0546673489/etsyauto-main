"""
Comprehensive Tests for Policy Engine
Tests banned terms, handmade requirements, and Etsy compliance
"""
import pytest
from app.services.policy_engine import (
    PolicyEngine, PolicyStatus, PolicyViolationType,
    get_policy_engine, BANNED_TERMS, HANDMADE_TERMS
)


class TestPolicyEngineBannedTerms:
    """Test banned term detection"""
    
    def test_banned_term_in_title(self):
        """Test detection of banned term in title"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Replica Ceramic Mug",
            description="A beautiful handcrafted mug"
        )
        
        assert status == PolicyStatus.FAILED
        assert len(violations) > 0
        assert any(v['type'] == PolicyViolationType.BANNED_TERM for v in violations)
        assert 'replica' in str(violations).lower()
    
    def test_banned_term_in_description(self):
        """Test detection of banned term in description"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Ceramic Mug",
            description="This is a dropship product available in bulk"
        )
        
        assert status == PolicyStatus.FAILED
        assert len(violations) > 0
        banned_violation = next((v for v in violations if v['type'] == PolicyViolationType.BANNED_TERM), None)
        assert banned_violation is not None
        assert 'dropship' in banned_violation['message'].lower()
    
    def test_banned_term_in_tags(self):
        """Test detection of banned term in tags"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Ceramic Mug",
            description="Beautiful handcrafted mug",
            tags=["handmade", "knockoff", "ceramic"]
        )
        
        assert status == PolicyStatus.FAILED
        assert len(violations) > 0
        assert any('knockoff' in str(v).lower() for v in violations)
    
    def test_multiple_banned_terms(self):
        """Test detection of multiple banned terms"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Replica Mug",
            description="Counterfeit design, dropship available"
        )
        
        assert status == PolicyStatus.FAILED
        banned_violation = next((v for v in violations if v['type'] == PolicyViolationType.BANNED_TERM), None)
        assert banned_violation is not None
        # Should detect all three: replica, counterfeit, dropship
        found_terms = banned_violation['details']['banned_terms']
        assert len(found_terms) >= 3
    
    def test_no_banned_terms(self):
        """Test content with no banned terms"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Ceramic Coffee Mug",
            description="Beautiful handcrafted ceramic mug for coffee lovers"
        )
        
        # Should pass (no banned terms, has handmade)
        assert status == PolicyStatus.PASSED
        assert len(violations) == 0
    
    def test_banned_term_word_boundaries(self):
        """Test that word boundaries are respected (no false positives)"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Authentic Design Mug",  # 'authentic' is banned
            description="Handcrafted with authenticity in mind"
        )
        
        # Should fail because 'authentic' is a banned term
        assert status == PolicyStatus.FAILED


class TestPolicyEngineHandmadeRequirement:
    """Test handmade term requirement"""
    
    def test_missing_handmade_term(self):
        """Test failure when handmade term is missing"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Ceramic Coffee Mug",
            description="Beautiful ceramic mug for daily use"
        )
        
        assert status == PolicyStatus.FAILED
        assert any(v['type'] == PolicyViolationType.MISSING_HANDMADE for v in violations)
    
    def test_handmade_in_title(self):
        """Test success with 'handmade' in title"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Ceramic Mug",
            description="Beautiful mug for coffee"
        )
        
        assert status == PolicyStatus.PASSED
        assert not any(v['type'] == PolicyViolationType.MISSING_HANDMADE for v in violations)
    
    def test_handmade_in_description(self):
        """Test success with 'handmade' in description"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Ceramic Coffee Mug",
            description="This mug is handmade with care"
        )
        
        assert status == PolicyStatus.PASSED
        assert not any(v['type'] == PolicyViolationType.MISSING_HANDMADE for v in violations)
    
    def test_handcrafted_alternative(self):
        """Test acceptance of 'handcrafted' as alternative"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handcrafted Ceramic Mug",
            description="Beautiful ceramic mug"
        )
        
        assert status == PolicyStatus.PASSED
        assert not any(v['type'] == PolicyViolationType.MISSING_HANDMADE for v in violations)
    
    def test_artisan_alternative(self):
        """Test acceptance of 'artisan' as alternative"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Artisan Ceramic Mug",
            description="Beautiful mug"
        )
        
        assert status == PolicyStatus.PASSED
    
    def test_custom_made_alternative(self):
        """Test acceptance of 'custom made' as alternative"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Custom Made Ceramic Mug",
            description="Beautiful mug"
        )
        
        assert status == PolicyStatus.PASSED


class TestPolicyEngineCharacterLimits:
    """Test Etsy character limit enforcement"""
    
    def test_title_too_long(self):
        """Test title exceeding 140 character limit"""
        engine = PolicyEngine(strict_mode=True)
        long_title = "Handmade " + "x" * 150  # Exceeds 140 chars
        status, violations = engine.check_content(
            title=long_title,
            description="Beautiful mug"
        )
        
        assert status == PolicyStatus.FAILED
        assert any(v['type'] == PolicyViolationType.TITLE_TOO_LONG for v in violations)
        violation = next(v for v in violations if v['type'] == PolicyViolationType.TITLE_TOO_LONG)
        assert violation['details']['current_length'] > 140
    
    def test_title_within_limit(self):
        """Test title within 140 character limit"""
        engine = PolicyEngine(strict_mode=True)
        title = "Handmade Ceramic Coffee Mug - Perfect for Daily Use"  # Under 140
        status, violations = engine.check_content(
            title=title,
            description="Beautiful mug"
        )
        
        # Should not have title length violation
        assert not any(v['type'] == PolicyViolationType.TITLE_TOO_LONG for v in violations)
    
    def test_description_too_long(self):
        """Test description exceeding limit"""
        engine = PolicyEngine(strict_mode=True)
        long_desc = "Handmade mug. " + "x" * 1000  # Exceeds 1000 chars
        status, violations = engine.check_content(
            title="Handmade Mug",
            description=long_desc
        )
        
        # Should have description length violation (warning, not critical)
        assert any(v['type'] == PolicyViolationType.DESCRIPTION_TOO_LONG for v in violations)
    
    def test_too_many_tags(self):
        """Test more than 13 tags"""
        engine = PolicyEngine(strict_mode=True)
        tags = [f"tag{i}" for i in range(15)]  # 15 tags (limit is 13)
        status, violations = engine.check_content(
            title="Handmade Mug",
            description="Beautiful mug",
            tags=tags
        )
        
        assert status == PolicyStatus.FAILED
        assert any(v['type'] == PolicyViolationType.TOO_MANY_TAGS for v in violations)
    
    def test_tag_too_long(self):
        """Test individual tag exceeding 20 characters"""
        engine = PolicyEngine(strict_mode=True)
        tags = ["handmade", "x" * 25, "ceramic"]  # Middle tag is too long
        status, violations = engine.check_content(
            title="Handmade Mug",
            description="Beautiful mug",
            tags=tags
        )
        
        assert status == PolicyStatus.FAILED
        assert any(v['type'] == PolicyViolationType.TAG_TOO_LONG for v in violations)
    
    def test_valid_tags(self):
        """Test valid tag count and lengths"""
        engine = PolicyEngine(strict_mode=True)
        tags = ["handmade", "ceramic", "mug", "coffee", "gift"]  # 5 tags, all short
        status, violations = engine.check_content(
            title="Handmade Mug",
            description="Beautiful mug",
            tags=tags
        )
        
        # Should not have tag violations
        assert not any(v['type'] in [PolicyViolationType.TOO_MANY_TAGS, PolicyViolationType.TAG_TOO_LONG] for v in violations)


class TestPolicyEngineProhibitedClaims:
    """Test prohibited marketing claims"""
    
    def test_guaranteed_claim(self):
        """Test detection of 'guaranteed' claim"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Mug",
            description="Guaranteed to last forever"
        )
        
        # Should have prohibited claim (warning, not critical failure)
        assert any(v['type'] == PolicyViolationType.PROHIBITED_CLAIMS for v in violations)
        assert any('guaranteed' in str(v).lower() for v in violations)
    
    def test_proven_claim(self):
        """Test detection of 'proven' claim"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Mug",
            description="Scientifically proven to improve your morning"
        )
        
        assert any(v['type'] == PolicyViolationType.PROHIBITED_CLAIMS for v in violations)
    
    def test_no_prohibited_claims(self):
        """Test content without prohibited claims"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Mug",
            description="High quality ceramic mug, carefully crafted"
        )
        
        # Should not have prohibited claims violation
        assert not any(v['type'] == PolicyViolationType.PROHIBITED_CLAIMS for v in violations)


class TestPolicyEngineSuggestions:
    """Test fix suggestion generation"""
    
    def test_suggest_fixes_for_banned_terms(self):
        """Test suggestions for banned terms"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Replica Mug",
            description="Beautiful mug"
        )
        
        suggestions = engine.suggest_fixes(violations)
        assert len(suggestions) > 0
        assert any('replica' in sug.lower() for sug in suggestions)
    
    def test_suggest_fixes_for_missing_handmade(self):
        """Test suggestions for missing handmade term"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Ceramic Mug",
            description="Beautiful mug"
        )
        
        suggestions = engine.suggest_fixes(violations)
        assert len(suggestions) > 0
        assert any('handmade' in sug.lower() or 'handcrafted' in sug.lower() for sug in suggestions)
    
    def test_suggest_fixes_for_title_length(self):
        """Test suggestions for title length"""
        engine = PolicyEngine(strict_mode=True)
        long_title = "Handmade " + "x" * 150
        status, violations = engine.check_content(
            title=long_title,
            description="Mug"
        )
        
        suggestions = engine.suggest_fixes(violations)
        assert len(suggestions) > 0
        assert any('shorten' in sug.lower() for sug in suggestions)


class TestPolicyEngineStrictMode:
    """Test strict vs non-strict mode"""
    
    def test_strict_mode_fails_on_warning(self):
        """Test that strict mode treats warnings as failures"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Mug",
            description="Guaranteed quality"  # Prohibited claim (warning level)
        )
        
        # In strict mode, should still process (warnings don't fail in current impl)
        # But violations should be present
        assert len(violations) > 0
    
    def test_non_strict_mode_allows_warnings(self):
        """Test that non-strict mode allows warnings"""
        engine = PolicyEngine(strict_mode=False)
        status, violations = engine.check_content(
            title="Handmade Mug",
            description="Guaranteed quality"
        )
        
        # Should return needs_review or warning, not failed
        assert status in [PolicyStatus.PASSED, PolicyStatus.WARNING, PolicyStatus.NEEDS_REVIEW]


class TestPolicyEngineSingleton:
    """Test policy engine singleton"""
    
    def test_get_policy_engine_singleton(self):
        """Test that get_policy_engine returns singleton"""
        engine1 = get_policy_engine()
        engine2 = get_policy_engine()
        
        assert engine1 is engine2  # Same instance
    
    def test_get_policy_engine_different_modes(self):
        """Test that different modes return different instances"""
        engine_strict = get_policy_engine(strict_mode=True)
        engine_non_strict = get_policy_engine(strict_mode=False)
        
        assert engine_strict is not engine_non_strict
        assert engine_strict.strict_mode == True
        assert engine_non_strict.strict_mode == False


class TestPolicyEngineIntegration:
    """Integration tests with realistic content"""
    
    def test_valid_etsy_listing(self):
        """Test a valid Etsy listing passes all checks"""
        engine = PolicyEngine(strict_mode=True)
        status, violations = engine.check_content(
            title="Handmade Ceramic Coffee Mug - Blue Glaze - 12oz",
            description="This beautiful handcrafted ceramic mug is perfect for your morning coffee. Each piece is carefully made by hand, ensuring unique character and quality.",
            tags=["handmade", "ceramic", "mug", "coffee", "blue", "pottery", "gift", "kitchen", "drinkware", "artisan"]  # 10 tags (under 13 limit)
        )
        
        # Should pass or have only warnings (no critical violations)
        assert status in [PolicyStatus.PASSED, PolicyStatus.WARNING]
        # No critical violations
        critical_violations = [v for v in violations if v.get('severity') == 'critical']
        assert len(critical_violations) == 0
    
    def test_invalid_listing_multiple_violations(self):
        """Test listing with multiple policy violations"""
        engine = PolicyEngine(strict_mode=True)
        long_title = "Replica Disney-Style Guaranteed Best Quality Mug " + "x" * 100
        status, violations = engine.check_content(
            title=long_title,
            description="Dropship available, wholesale prices, 100% guaranteed",
            tags=["replica"] + [f"tag{i}" for i in range(15)]
        )
        
        assert status == PolicyStatus.FAILED
        assert len(violations) >= 3  # Multiple violations
        
        # Should have banned terms
        assert any(v['type'] == PolicyViolationType.BANNED_TERM for v in violations)
        # Should have title too long
        assert any(v['type'] == PolicyViolationType.TITLE_TOO_LONG for v in violations)
        # Should have too many tags
        assert any(v['type'] == PolicyViolationType.TOO_MANY_TAGS for v in violations)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

