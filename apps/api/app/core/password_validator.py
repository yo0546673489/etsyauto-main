"""
Password Security Validator
Production-grade password validation based on NIST 800-63B and OWASP guidelines
"""
import re
from typing import List, Tuple


class PasswordValidator:
    """
    Comprehensive password validation with strength scoring
    """

    MIN_LENGTH = 8
    MAX_LENGTH = 128

    # Common passwords to reject (expand this list)
    COMMON_PASSWORDS = {
        'password', 'password123', '123456', '12345678', 'qwerty',
        'abc123', 'monkey', '1234567', 'letmein', 'trustno1',
        'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
        'ashley', 'bailey', 'passw0rd', 'shadow', '123123',
        'admin', 'welcome', 'login', 'Password1', 'Password123',
        'password1', 'password12', 'qwerty123', 'welcome123',
        'admin123', 'user123', 'test123', 'demo123', 'temp123'
    }

    @staticmethod
    def validate(password: str) -> Tuple[bool, List[str]]:
        """
        Validate password strength

        Args:
            password: Password to validate

        Returns:
            Tuple of (is_valid, list_of_error_messages)
        """
        errors = []

        # Check length
        if len(password) < PasswordValidator.MIN_LENGTH:
            errors.append(
                f'Password must be at least {PasswordValidator.MIN_LENGTH} characters long'
            )

        if len(password) > PasswordValidator.MAX_LENGTH:
            errors.append(
                f'Password must be less than {PasswordValidator.MAX_LENGTH} characters'
            )

        # Check for uppercase
        if not re.search(r'[A-Z]', password):
            errors.append('Password must contain at least one uppercase letter (A-Z)')

        # Check for lowercase
        if not re.search(r'[a-z]', password):
            errors.append('Password must contain at least one lowercase letter (a-z)')

        # Check for numbers (at least 2)
        numbers = re.findall(r'\d', password)
        if len(numbers) < 2:
            errors.append('Password must contain at least 2 numbers')

        # Check for special characters
        if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~`]', password):
            errors.append(
                'Password must contain at least one special character (!@#$%^&* etc.)'
            )

        # Check for common passwords
        if password.lower() in PasswordValidator.COMMON_PASSWORDS:
            errors.append(
                'This password is too common. Please choose a more unique password'
            )

        # Check for sequential characters (abc, 123)
        if PasswordValidator._has_sequential_chars(password):
            errors.append(
                'Password should not contain sequential characters (abc, 123, etc.)'
            )

        # Check for repeated characters (aaa, 111)
        if PasswordValidator._has_repeated_chars(password):
            errors.append(
                'Password should not contain 3+ repeated characters (aaa, 111, etc.)'
            )

        return (len(errors) == 0, errors)

    @staticmethod
    def _has_sequential_chars(password: str, length: int = 3) -> bool:
        """Check for sequential characters like 'abc' or '123'"""
        password_lower = password.lower()

        # Check for sequential letters (abc, xyz)
        for i in range(len(password_lower) - length + 1):
            substring = password_lower[i:i+length]
            if substring.isalpha():
                if all(
                    ord(substring[j+1]) == ord(substring[j]) + 1
                    for j in range(len(substring)-1)
                ):
                    return True

        # Check for sequential numbers (123, 456)
        for i in range(len(password) - length + 1):
            substring = password[i:i+length]
            if substring.isdigit():
                if all(
                    int(substring[j+1]) == int(substring[j]) + 1
                    for j in range(len(substring)-1)
                ):
                    return True

        return False

    @staticmethod
    def _has_repeated_chars(password: str, length: int = 3) -> bool:
        """Check for repeated characters like 'aaa' or '111'"""
        for i in range(len(password) - length + 1):
            substring = password[i:i+length]
            if len(set(substring)) == 1:  # All characters are the same
                return True
        return False

    @staticmethod
    def calculate_strength(password: str) -> Tuple[int, str]:
        """
        Calculate password strength score

        Args:
            password: Password to evaluate

        Returns:
            Tuple of (score_0_to_100, strength_label)
        """
        score = 0

        # Base score for length (max 30 points)
        score += min(30, len(password) * 2)

        # Uppercase letters (10 points)
        if re.search(r'[A-Z]', password):
            score += 10

        # Lowercase letters (10 points)
        if re.search(r'[a-z]', password):
            score += 10

        # Numbers (max 20 points, 5 per digit)
        numbers = len(re.findall(r'\d', password))
        score += min(20, numbers * 5)

        # Special characters (max 20 points, 5 per char)
        special = len(re.findall(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~`]', password))
        score += min(20, special * 5)

        # Variety bonus (all 4 character types)
        char_types = sum([
            bool(re.search(r'[A-Z]', password)),
            bool(re.search(r'[a-z]', password)),
            bool(re.search(r'\d', password)),
            bool(re.search(r'[^A-Za-z0-9]', password))
        ])
        if char_types >= 4:
            score += 10

        # Penalize common passwords
        if password.lower() in PasswordValidator.COMMON_PASSWORDS:
            score = min(score, 20)

        # Penalize sequential/repeated patterns
        if PasswordValidator._has_sequential_chars(password):
            score -= 10
        if PasswordValidator._has_repeated_chars(password):
            score -= 10

        score = max(0, min(100, score))

        # Determine label
        if score < 40:
            label = "Weak"
        elif score < 60:
            label = "Fair"
        elif score < 80:
            label = "Good"
        else:
            label = "Strong"

        return (score, label)


# Convenience function
def validate_password(password: str) -> Tuple[bool, List[str]]:
    """
    Validate password strength

    Returns:
        (is_valid, error_messages)
    """
    return PasswordValidator.validate(password)
