"""
Audit Log Constants
Action types and status values for consistent audit logging
"""


class AuditAction:
    """Standard audit action names"""
    # Authentication
    AUTH_LOGIN = "auth.login"
    AUTH_LOGOUT = "auth.logout"
    AUTH_REGISTER = "auth.register"
    AUTH_PASSWORD_RESET = "auth.password_reset"
    AUTH_TOKEN_REFRESH = "auth.token_refresh"
    
    # User management
    USER_CREATE = "user.create"
    USER_UPDATE = "user.update"
    USER_DELETE = "user.delete"
    USER_INVITE = "user.invite"
    
    # Product management
    PRODUCT_CREATE = "product.create"
    PRODUCT_UPDATE = "product.update"
    PRODUCT_DELETE = "product.delete"
    PRODUCT_IMPORT = "product.import"
    
    # Listing operations
    LISTING_PUBLISH = "listing.publish"
    LISTING_UPDATE = "listing.update"
    LISTING_DELETE = "listing.delete"
    LISTING_SYNC = "listing.sync"
    
    # Order operations
    ORDER_SYNC = "order.sync"
    ORDER_UPDATE = "order.update"
    
    
    # Ingestion
    INGESTION_START = "ingestion.start"
    INGESTION_COMPLETE = "ingestion.complete"
    INGESTION_FAILED = "ingestion.failed"
    
    # OAuth
    OAUTH_CONNECT = "oauth.connect"
    OAUTH_DISCONNECT = "oauth.disconnect"
    OAUTH_TOKEN_REFRESH = "oauth.token_refresh"


class AuditStatus:
    """Standard audit status values"""
    SUCCESS = "success"
    FAILURE = "failure"
    PENDING = "pending"
    ERROR = "error"
    PARTIAL = "partial"  # Partially successful (e.g., batch operations)

