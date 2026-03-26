"""
Pytest Configuration and Shared Fixtures
Provides reusable test fixtures for tenant, shop, user, products, etc.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
import os

from app.core.database import Base, get_db
from app.models.tenancy import Tenant, User, Membership, Shop, OAuthToken
from app.models.products import Product
from app.services.encryption import token_encryptor
from app.core.jwt_manager import get_jwt_manager
from main import app


# Test database URL
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://etsy_user:etsy_password@localhost:5432/etsy_automation_test"
)

# Create test engine
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Create test database tables before all tests"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db() -> Session:
    """Provide a clean database session for each test"""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db: Session):
    """Provide a test client with database override"""
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    app.dependency_overrides.clear()


# ==================== Tenant Fixtures ====================

@pytest.fixture
def tenant(db: Session) -> Tenant:
    """Create a test tenant"""
    tenant = Tenant(
        name="Test Tenant",
        status="active",
        billing_tier="pro",
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@pytest.fixture
def tenant_free(db: Session) -> Tenant:
    """Create a free-tier test tenant"""
    tenant = Tenant(
        name="Free Tenant",
        status="active",
        billing_tier="starter",
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


# ==================== User Fixtures ====================

@pytest.fixture
def owner_user(db: Session, tenant: Tenant) -> User:
    """Create an owner user"""
    user = User(
        email="owner@test.com",
        password_hash="hashed_password_here",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Create membership
    membership = Membership(
        tenant_id=tenant.id,
        user_id=user.id,
        role="owner",
        invitation_status="accepted"
    )
    db.add(membership)
    db.commit()
    
    return user


@pytest.fixture
def admin_user(db: Session, tenant: Tenant) -> User:
    """Create an admin user"""
    user = User(
        email="admin@test.com",
        password_hash="hashed_password_here",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    membership = Membership(
        tenant_id=tenant.id,
        user_id=user.id,
        role="admin",
        invitation_status="accepted"
    )
    db.add(membership)
    db.commit()
    
    return user


@pytest.fixture
def creator_user(db: Session, tenant: Tenant) -> User:
    """Create a creator user"""
    user = User(
        email="creator@test.com",
        password_hash="hashed_password_here",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    membership = Membership(
        tenant_id=tenant.id,
        user_id=user.id,
        role="creator",
        invitation_status="accepted"
    )
    db.add(membership)
    db.commit()
    
    return user


@pytest.fixture
def viewer_user(db: Session, tenant: Tenant) -> User:
    """Create a viewer user"""
    user = User(
        email="viewer@test.com",
        password_hash="hashed_password_here",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    membership = Membership(
        tenant_id=tenant.id,
        user_id=user.id,
        role="viewer",
        invitation_status="accepted"
    )
    db.add(membership)
    db.commit()
    
    return user


# ==================== Shop Fixtures ====================

@pytest.fixture
def shop(db: Session, tenant: Tenant) -> Shop:
    """Create a test shop"""
    shop = Shop(
        tenant_id=tenant.id,
        display_name="Test Shop",
        etsy_shop_id="12345678",
        status="connected",
    )
    db.add(shop)
    db.commit()
    db.refresh(shop)
    return shop


@pytest.fixture
def shop_with_oauth(db: Session, tenant: Tenant, shop: Shop) -> Shop:
    """Create a shop with OAuth tokens"""
    oauth_token = OAuthToken(
        tenant_id=tenant.id,
        shop_id=shop.id,
        provider="etsy",
        access_token=token_encryptor.encrypt("test_access_token"),
        refresh_token=token_encryptor.encrypt("test_refresh_token"),
        expires_at=datetime.utcnow() + timedelta(hours=1),
        scopes="billing_r transactions_r",
    )
    db.add(oauth_token)
    db.commit()

    return shop


@pytest.fixture
def multiple_shops(db: Session, tenant: Tenant) -> list[Shop]:
    """Create multiple shops for testing"""
    shops = []
    for i in range(10):
        shop = Shop(
            tenant_id=tenant.id,
            display_name=f"Test Shop {i+1}",
            etsy_shop_id=f"1234567{i}",
            status="connected",
        )
        db.add(shop)
        shops.append(shop)
    
    db.commit()
    for shop in shops:
        db.refresh(shop)
    
    return shops


# ==================== Product Fixtures ====================

@pytest.fixture
def product(db: Session, tenant: Tenant, shop: Shop) -> Product:
    """Create a test product"""
    product = Product(
        tenant_id=tenant.id,
        shop_id=shop.id,
        sku="TEST-SKU-001",
        title_raw="Test Product",
        description_raw="Test product description with handmade content",
        price=2999,  # cents
        quantity=100,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@pytest.fixture
def product_with_variants(db: Session, tenant: Tenant, shop: Shop) -> Product:
    """Create a product with variants"""
    product = Product(
        tenant_id=tenant.id,
        shop_id=shop.id,
        sku="TEST-SKU-VAR-001",
        title_raw="Product with Variants",
        description_raw="Handmade product with size variants",
        price=3999,  # cents
        quantity=50,
        variants=[{"option_name": "Size", "values": ["S", "M", "L"]}],
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@pytest.fixture
def bulk_products(db: Session, tenant: Tenant, shop: Shop, count: int = 100) -> list[Product]:
    """Create bulk products for load testing"""
    products = []
    for i in range(count):
        product = Product(
            tenant_id=tenant.id,
            shop_id=shop.id,
            sku=f"BULK-SKU-{i:04d}",
            title_raw=f"Bulk Product {i+1}",
            description_raw=f"Handmade bulk product {i+1} description",
            price=1999 + (i % 50) * 100,  # cents
            quantity=10 + (i % 100),
        )
        db.add(product)
        products.append(product)
    
    db.commit()
    for product in products:
        db.refresh(product)
    
    return products


# ==================== JWT Fixtures ====================

@pytest.fixture
def access_token(owner_user: User, tenant: Tenant, shop: Shop) -> str:
    """Generate a valid access token"""
    jwt_manager = get_jwt_manager()
    return jwt_manager.create_access_token(
        user_id=owner_user.id,
        tenant_id=tenant.id,
        role="owner",
        shop_ids=[shop.id]
    )


@pytest.fixture
def admin_access_token(admin_user: User, tenant: Tenant, shop: Shop) -> str:
    """Generate an admin access token"""
    jwt_manager = get_jwt_manager()
    return jwt_manager.create_access_token(
        user_id=admin_user.id,
        tenant_id=tenant.id,
        role="admin",
        shop_ids=[shop.id]
    )


@pytest.fixture
def creator_access_token(creator_user: User, tenant: Tenant, shop: Shop) -> str:
    """Generate a creator access token"""
    jwt_manager = get_jwt_manager()
    return jwt_manager.create_access_token(
        user_id=creator_user.id,
        tenant_id=tenant.id,
        role="creator",
        shop_ids=[shop.id]
    )


@pytest.fixture
def viewer_access_token(viewer_user: User, tenant: Tenant, shop: Shop) -> str:
    """Generate a viewer access token"""
    jwt_manager = get_jwt_manager()
    return jwt_manager.create_access_token(
        user_id=viewer_user.id,
        tenant_id=tenant.id,
        role="viewer",
        shop_ids=[shop.id]
    )


@pytest.fixture
def expired_access_token(owner_user: User, tenant: Tenant, shop: Shop) -> str:
    """Generate an expired access token"""
    jwt_manager = get_jwt_manager()
    # Temporarily set short lifetime
    original_lifetime = jwt_manager.ACCESS_TOKEN_LIFETIME
    jwt_manager.ACCESS_TOKEN_LIFETIME = timedelta(seconds=-1)
    
    token = jwt_manager.create_access_token(
        user_id=owner_user.id,
        tenant_id=tenant.id,
        role="owner",
        shop_ids=[shop.id]
    )
    
    # Restore original lifetime
    jwt_manager.ACCESS_TOKEN_LIFETIME = original_lifetime
    
    return token


# ==================== Helper Functions ====================

def create_auth_headers(token: str) -> dict:
    """Create authorization headers for API requests"""
    return {"Authorization": f"Bearer {token}"}


def create_test_csv_data() -> bytes:
    """Create test CSV data for ingestion"""
    csv_content = """sku,title,description,price,quantity
TEST-001,Handmade Mug,Beautiful handmade ceramic mug,29.99,10
TEST-002,Handmade Bowl,Artisan handmade bowl,39.99,5
TEST-003,Handmade Plate,Handcrafted dinner plate,24.99,15"""
    return csv_content.encode()


def create_malicious_csv_data() -> bytes:
    """Create CSV with injection attempts for security testing"""
    csv_content = """sku,title,description,price,quantity
=1+1,Normal Title,Normal description,29.99,10
@SUM(A1:A10),Title2,Description2,39.99,5
+cmd|'/c calc'!A1,Title3,Description3,24.99,15
-2+3,Title4,Description4,19.99,20"""
    return csv_content.encode()
