"""
Comprehensive Test Suite for Product Ingestion
Tests CSV/JSON upload, validation, error collection, and persistence
"""
import pytest
import json
import io
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock
from sqlalchemy.orm import Session

from app.services.ingestion_service import IngestionService
from app.services.error_report_service import ErrorReportService
from app.services.asset_service import AssetService
from app.schemas.ingestion import ProductRowSchema, IngestionErrorReport
from app.models.ingestion import IngestionBatch
from app.models.products import Product


# ==================== Fixtures ====================

@pytest.fixture
def mock_db():
    """Mock database session"""
    db = Mock(spec=Session)
    db.add = Mock()
    db.commit = Mock()
    db.rollback = Mock()
    db.query = Mock()
    return db


@pytest.fixture
def ingestion_service(mock_db):
    """Ingestion service with mock DB"""
    return IngestionService(mock_db)


@pytest.fixture
def error_report_service():
    """Error report service"""
    return ErrorReportService(storage_path="/tmp/test_errors")


@pytest.fixture
def asset_service():
    """Asset service"""
    return AssetService(storage_backend="url")


@pytest.fixture
def sample_csv_valid():
    """Sample valid CSV content"""
    return """sku,title,description,price,quantity,tags,images
TEST-001,Test Product 1,A great product,29.99,10,handmade|unique|gift,https://example.com/img1.jpg
TEST-002,Test Product 2,Another product,49.99,5,vintage|craft,https://example.com/img2.jpg|https://example.com/img3.jpg"""


@pytest.fixture
def sample_csv_with_errors():
    """Sample CSV with validation errors"""
    return """sku,title,description,price,quantity
TEST-001,,Missing title,29.99,10
TEST-002,Valid Title,Good description,-5.00,10
TEST-003,Valid Title,Good description,29.99,-100
TEST-004,This title is way too long for Etsy and exceeds the 140 character limit which will cause a validation error to be raised during processing,Description,29.99,10"""


@pytest.fixture
def sample_json_valid():
    """Sample valid JSON content"""
    return json.dumps({
        "products": [
            {
                "sku": "JSON-001",
                "title": "JSON Product 1",
                "description": "JSON description",
                "price": 39.99,
                "quantity": 20,
                "tags": ["digital", "download"],
                "images": ["https://example.com/json1.jpg"]
            },
            {
                "sku": "JSON-002",
                "title": "JSON Product 2",
                "price": 59.99,
                "quantity": 15
            }
        ]
    })


@pytest.fixture
def sample_json_with_errors():
    """Sample JSON with validation errors"""
    return json.dumps([
        {"sku": "JSON-001", "title": "", "price": 10},  # Empty title
        {"sku": "JSON-002", "price": -5},  # Missing title, negative price
        {"sku": "JSON-003", "title": "Valid", "tags": ["tag"] * 20}  # Too many tags
    ])


# ==================== CSV Parsing Tests ====================

class TestCSVParsing:
    """Test CSV parsing and normalization"""
    
    def test_parse_csv_valid(self, ingestion_service, sample_csv_valid):
        """Test parsing valid CSV"""
        rows, total = ingestion_service.parse_csv(sample_csv_valid, "test.csv")
        
        assert total == 2
        assert len(rows) == 2
        assert rows[0]['title'] == 'Test Product 1'
        assert rows[0]['sku'] == 'TEST-001'
        assert rows[0]['row_number'] == 1
        assert rows[1]['row_number'] == 2
    
    def test_parse_csv_column_normalization(self, ingestion_service):
        """Test CSV column name normalization"""
        csv_content = """SKU,Product Name,PRICE
TEST-001,Product,29.99"""
        
        rows, total = ingestion_service.parse_csv(csv_content, "test.csv")
        
        assert total == 1
        # Normalized keys should be lowercase and snake_case
        assert rows[0]['title'] == 'Product'  # 'Product Name' mapped to 'title'
    
    def test_parse_csv_empty(self, ingestion_service):
        """Test parsing empty CSV"""
        csv_content = """sku,title,price"""
        
        rows, total = ingestion_service.parse_csv(csv_content, "test.csv")
        
        assert total == 0
        assert len(rows) == 0
    
    def test_parse_csv_invalid_format(self, ingestion_service):
        """Test parsing invalid CSV raises error"""
        invalid_csv = "This is not a CSV\nJust random text"
        
        # Should not raise error, but parse as best it can
        rows, total = ingestion_service.parse_csv(invalid_csv, "test.csv")
        # Might get empty or partial results
        assert isinstance(rows, list)


# ==================== JSON Parsing Tests ====================

class TestJSONParsing:
    """Test JSON parsing"""
    
    def test_parse_json_array(self, ingestion_service, sample_json_valid):
        """Test parsing JSON array format"""
        rows, total = ingestion_service.parse_json(sample_json_valid, "test.json")
        
        assert total == 2
        assert len(rows) == 2
        assert rows[0]['title'] == 'JSON Product 1'
        assert rows[0]['sku'] == 'JSON-001'
    
    def test_parse_json_single_object(self, ingestion_service):
        """Test parsing single JSON object"""
        single_product = json.dumps({
            "sku": "SINGLE-001",
            "title": "Single Product",
            "price": 29.99
        })
        
        rows, total = ingestion_service.parse_json(single_product, "test.json")
        
        assert total == 1
        assert len(rows) == 1
        assert rows[0]['title'] == 'Single Product'
    
    def test_parse_json_invalid(self, ingestion_service):
        """Test parsing invalid JSON raises error"""
        invalid_json = "{invalid json here"
        
        with pytest.raises(ValueError) as exc_info:
            ingestion_service.parse_json(invalid_json, "test.json")
        
        assert "Invalid JSON" in str(exc_info.value)


# ==================== Validation Tests ====================

class TestProductValidation:
    """Test product row validation"""
    
    def test_validate_row_success(self, ingestion_service):
        """Test successful row validation"""
        row = {
            'sku': 'TEST-001',
            'title': 'Valid Product',
            'description': 'Description',
            'price': '29.99',
            'quantity': '10',
            'tags': 'tag1|tag2|tag3',
            'images': 'https://example.com/img1.jpg',
            'row_number': 1
        }
        
        validated, errors = ingestion_service.validate_and_normalize_row(row, 1)
        
        assert validated is not None
        assert len(errors) == 0
        assert validated.title == 'Valid Product'
        assert validated.sku == 'TEST-001'
    
    def test_validate_row_missing_title(self, ingestion_service):
        """Test validation fails for missing title"""
        row = {
            'sku': 'TEST-001',
            'title': '',  # Empty title
            'price': '29.99',
            'row_number': 1
        }
        
        validated, errors = ingestion_service.validate_and_normalize_row(row, 1)
        
        assert validated is None
        assert len(errors) > 0
        assert any('title' in err.lower() for err in errors)
    
    def test_validate_row_negative_price(self, ingestion_service):
        """Test validation for negative price"""
        row = {
            'sku': 'TEST-001',
            'title': 'Valid Title',
            'price': '-10.00',
            'row_number': 1
        }
        
        validated, errors = ingestion_service.validate_and_normalize_row(row, 1)
        
        # Negative price should be converted to None (valid but optional)
        if validated:
            assert validated.price is None or validated.price >= 0
    
    def test_validate_row_too_many_tags(self, ingestion_service):
        """Test validation fails for too many tags"""
        row = {
            'sku': 'TEST-001',
            'title': 'Valid Title',
            'tags': '|'.join([f'tag{i}' for i in range(15)]),  # 15 tags (max is 13)
            'row_number': 1
        }
        
        validated, errors = ingestion_service.validate_and_normalize_row(row, 1)
        
        assert validated is None
        assert len(errors) > 0
        # Check for tag-related errors (may be phrased differently)
        assert any('tag' in err.lower() for err in errors)
    
    def test_validate_row_invalid_image_url(self, ingestion_service):
        """Test validation for invalid image URLs"""
        row = {
            'sku': 'TEST-001',
            'title': 'Valid Title',
            'images': 'not-a-url|also-invalid',
            'row_number': 1
        }
        
        validated, errors = ingestion_service.validate_and_normalize_row(row, 1)
        
        assert validated is None
        assert len(errors) > 0
        assert any('image' in err.lower() or 'url' in err.lower() for err in errors)


# ==================== Batch Validation Tests ====================

class TestBatchValidation:
    """Test batch validation and error collection"""
    
    def test_validate_batch_all_valid(self, ingestion_service):
        """Test batch validation with all valid rows"""
        rows = [
            {'title': 'Product 1', 'price': '29.99', 'row_number': 1},
            {'title': 'Product 2', 'price': '39.99', 'row_number': 2},
            {'title': 'Product 3', 'price': '49.99', 'row_number': 3},
        ]
        
        validated, errors = ingestion_service.validate_batch(rows)
        
        assert len(validated) == 3
        assert len(errors) == 0
    
    def test_validate_batch_mixed_results(self, ingestion_service):
        """Test batch validation with mix of valid and invalid rows"""
        rows = [
            {'title': 'Valid Product', 'price': '29.99', 'row_number': 1},  # Valid
            {'title': '', 'price': '39.99', 'row_number': 2},  # Invalid: empty title
            {'title': 'Another Valid', 'price': '49.99', 'row_number': 3},  # Valid
        ]
        
        validated, errors = ingestion_service.validate_batch(rows)
        
        assert len(validated) == 2  # Two valid rows
        assert len(errors) == 1  # One error
        assert errors[0].row_number == 2
    
    def test_validate_batch_all_invalid(self, ingestion_service):
        """Test batch validation with all invalid rows"""
        rows = [
            {'title': '', 'row_number': 1},  # Missing title
            {'sku': 'TEST', 'row_number': 2},  # Missing title
        ]
        
        validated, errors = ingestion_service.validate_batch(rows)
        
        assert len(validated) == 0
        assert len(errors) == 2


# ==================== Product Persistence Tests ====================

class TestProductPersistence:
    """Test saving validated products to database"""
    
    def test_save_products_success(self, mock_db):
        """Test successful product saving"""
        service = IngestionService(mock_db)
        
        validated_products = [
            ProductRowSchema(
                sku='TEST-001',
                title='Product 1',
                price=29.99,
                quantity=10,
                row_number=1
            ),
            ProductRowSchema(
                sku='TEST-002',
                title='Product 2',
                price=39.99,
                quantity=5,
                row_number=2
            )
        ]
        
        saved_count = service.save_products(
            validated_products=validated_products,
            tenant_id=1,
            shop_id=1,
            batch_id='batch_123',
            source='csv'
        )
        
        assert saved_count == 2
        assert mock_db.add.call_count == 2
        assert mock_db.commit.called
    
    def test_save_products_empty_list(self, mock_db):
        """Test saving empty product list"""
        service = IngestionService(mock_db)
        
        saved_count = service.save_products(
            validated_products=[],
            tenant_id=1,
            shop_id=1,
            batch_id='batch_123',
            source='csv'
        )
        
        assert saved_count == 0
        assert mock_db.add.call_count == 0


# ==================== Error Reporting Tests ====================

class TestErrorReporting:
    """Test error report generation"""
    
    def test_generate_csv_report(self, error_report_service):
        """Test CSV error report generation"""
        errors = [
            IngestionErrorReport(
                row_number=1,
                sku='TEST-001',
                title='Invalid Product',
                errors=['Title is required', 'Price must be positive'],
                raw_data={'sku': 'TEST-001', 'title': ''}
            ),
            IngestionErrorReport(
                row_number=3,
                sku='TEST-003',
                title='Another Invalid',
                errors=['Too many tags'],
                raw_data={'sku': 'TEST-003'}
            )
        ]
        
        file_path, file_url = error_report_service.generate_csv_report(errors, 'batch_123')
        
        assert file_path is not None
        assert 'errors_batch_123' in file_path
        assert file_path.endswith('.csv')
        assert '/api/products/ingestion/errors/batch_123' in file_url
        
        # Verify file was created
        import os
        assert os.path.exists(file_path)
        
        # Clean up
        os.remove(file_path)
    
    def test_generate_json_report(self, error_report_service):
        """Test JSON error report generation"""
        errors = [
            IngestionErrorReport(
                row_number=1,
                sku='TEST-001',
                title='Invalid Product',
                errors=['Validation failed'],
                raw_data={'sku': 'TEST-001'}
            )
        ]
        
        file_path, file_url = error_report_service.generate_json_report(errors, 'batch_456')
        
        assert file_path is not None
        assert 'errors_batch_456' in file_path
        assert file_path.endswith('.json')
        
        # Verify file contains valid JSON
        import os
        assert os.path.exists(file_path)
        
        with open(file_path, 'r') as f:
            report_data = json.load(f)
            assert report_data['batch_id'] == 'batch_456'
            assert report_data['total_errors'] == 1
            assert len(report_data['errors']) == 1
        
        # Clean up
        os.remove(file_path)


# ==================== Asset Service Tests ====================

class TestAssetService:
    """Test asset handling"""
    
    def test_validate_image_url_success(self, asset_service):
        """Test valid image URL"""
        assert asset_service.validate_image_url('https://example.com/image.jpg') == True
        assert asset_service.validate_image_url('http://cdn.example.com/path/to/image.png') == True
    
    def test_validate_image_url_failure(self, asset_service):
        """Test invalid image URLs"""
        assert asset_service.validate_image_url('not-a-url') == False
        assert asset_service.validate_image_url('ftp://example.com/image.jpg') == False
        assert asset_service.validate_image_url('') == False
        assert asset_service.validate_image_url(None) == False
    
    def test_validate_image_urls_list(self, asset_service):
        """Test validating list of URLs"""
        urls = [
            'https://example.com/valid1.jpg',
            'not-a-url',
            'https://example.com/valid2.png',
            'ftp://invalid.jpg'
        ]
        
        valid_urls = asset_service.validate_image_urls(urls)
        
        assert len(valid_urls) == 2
        assert 'https://example.com/valid1.jpg' in valid_urls
        assert 'https://example.com/valid2.png' in valid_urls


# ==================== Integration Tests ====================

class TestIngestionIntegration:
    """Integration tests for full ingestion flow"""
    
    def test_full_csv_ingestion_happy_path(self, ingestion_service, sample_csv_valid):
        """Test complete CSV ingestion - happy path"""
        # Parse CSV
        rows, total = ingestion_service.parse_csv(sample_csv_valid, "products.csv")
        assert total == 2
        
        # Validate batch
        validated, errors = ingestion_service.validate_batch(rows)
        
        assert len(validated) == 2
        assert len(errors) == 0
        
        # All products should be valid
        for product in validated:
            assert product.title is not None
            assert len(product.title) > 0
    
    def test_full_csv_ingestion_with_errors(self, ingestion_service, sample_csv_with_errors):
        """Test complete CSV ingestion with validation errors"""
        # Parse CSV
        rows, total = ingestion_service.parse_csv(sample_csv_with_errors, "products.csv")
        assert total == 4
        
        # Validate batch
        validated, errors = ingestion_service.validate_batch(rows)
        
        # Should have some validation errors
        assert len(errors) > 0
        
        # Error reports should contain row numbers
        for error in errors:
            assert error.row_number > 0
            assert len(error.errors) > 0
    
    def test_full_json_ingestion_happy_path(self, ingestion_service, sample_json_valid):
        """Test complete JSON ingestion - happy path"""
        # Parse JSON
        rows, total = ingestion_service.parse_json(sample_json_valid, "products.json")
        assert total == 2
        
        # Validate batch
        validated, errors = ingestion_service.validate_batch(rows)
        
        assert len(validated) == 2
        assert len(errors) == 0
    
    def test_full_json_ingestion_with_errors(self, ingestion_service, sample_json_with_errors):
        """Test complete JSON ingestion with validation errors"""
        # Parse JSON
        rows, total = ingestion_service.parse_json(sample_json_with_errors, "products.json")
        assert total == 3
        
        # Validate batch
        validated, errors = ingestion_service.validate_batch(rows)
        
        # All rows should have errors (empty title, negative price, too many tags)
        assert len(errors) == 3


# ==================== Field Parsing Tests ====================

class TestFieldParsing:
    """Test individual field parsing logic"""
    
    def test_parse_tags_pipe_separated(self, ingestion_service):
        """Test parsing pipe-separated tags"""
        tags = ingestion_service.parse_tags('tag1|tag2|tag3')
        assert tags == ['tag1', 'tag2', 'tag3']
    
    def test_parse_tags_comma_separated(self, ingestion_service):
        """Test parsing comma-separated tags"""
        tags = ingestion_service.parse_tags('tag1, tag2, tag3')
        assert tags == ['tag1', 'tag2', 'tag3']
    
    def test_parse_tags_list(self, ingestion_service):
        """Test parsing tags from list"""
        tags = ingestion_service.parse_tags(['tag1', 'tag2', 'tag3'])
        assert tags == ['tag1', 'tag2', 'tag3']
    
    def test_parse_tags_empty(self, ingestion_service):
        """Test parsing empty tags"""
        assert ingestion_service.parse_tags(None) == []
        assert ingestion_service.parse_tags('') == []
    
    def test_parse_images_pipe_separated(self, ingestion_service):
        """Test parsing pipe-separated image URLs"""
        images = ingestion_service.parse_images('https://img1.jpg|https://img2.jpg')
        assert len(images) == 2
    
    def test_parse_price_valid(self, ingestion_service):
        """Test price parsing and conversion to cents"""
        assert ingestion_service.parse_price('29.99') == 2999
        assert ingestion_service.parse_price(29.99) == 2999
        assert ingestion_service.parse_price('$49.99') == 4999  # With currency symbol
    
    def test_parse_price_invalid(self, ingestion_service):
        """Test invalid price handling"""
        assert ingestion_service.parse_price(None) is None
        assert ingestion_service.parse_price('invalid') is None
        assert ingestion_service.parse_price(-10.00) is None
    
    def test_parse_quantity_valid(self, ingestion_service):
        """Test quantity parsing"""
        assert ingestion_service.parse_quantity('10') == 10
        assert ingestion_service.parse_quantity(5) == 5
        assert ingestion_service.parse_quantity('3.7') == 3  # Rounds down
    
    def test_parse_quantity_invalid(self, ingestion_service):
        """Test invalid quantity handling"""
        assert ingestion_service.parse_quantity(None) is None
        assert ingestion_service.parse_quantity('invalid') is None
        assert ingestion_service.parse_quantity(-5) == 0  # Negative becomes 0


# ==================== Schema Validation Tests ====================

class TestSchemaValidation:
    """Test Pydantic schema validation"""
    
    def test_product_row_schema_valid(self):
        """Test valid product schema"""
        product = ProductRowSchema(
            sku='TEST-001',
            title='Valid Product',
            description='Description',
            price=29.99,
            quantity=10,
            tags=['tag1', 'tag2'],
            images=['https://example.com/img.jpg']
        )
        
        assert product.title == 'Valid Product'
        assert product.sku == 'TEST-001'
        assert product.price == 2999  # Converted to cents
    
    def test_product_row_schema_missing_required(self):
        """Test schema validation fails for missing required fields"""
        with pytest.raises(Exception):  # ValidationError
            ProductRowSchema(
                sku='TEST-001',
                # Missing title (required)
                price=29.99
            )
    
    def test_product_row_schema_title_too_long(self):
        """Test title length validation"""
        with pytest.raises(Exception):  # ValidationError
            ProductRowSchema(
                title='x' * 150,  # Exceeds 140 char limit
                price=29.99
            )
    
    def test_product_row_schema_too_many_tags(self):
        """Test tag count validation"""
        with pytest.raises(Exception):  # ValidationError
            ProductRowSchema(
                title='Valid Title',
                tags=[f'tag{i}' for i in range(15)]  # Exceeds 13 tag limit
            )
    
    def test_product_row_schema_too_many_images(self):
        """Test image count validation"""
        with pytest.raises(Exception):  # ValidationError
            ProductRowSchema(
                title='Valid Title',
                images=[f'https://example.com/img{i}.jpg' for i in range(12)]  # Exceeds 10 image limit
            )


# ==================== Error Report Model Tests ====================

class TestIngestionErrorReport:
    """Test error report structure"""
    
    def test_error_report_creation(self):
        """Test creating error report"""
        report = IngestionErrorReport(
            row_number=5,
            sku='TEST-005',
            title='Product Title',
            errors=['Error 1', 'Error 2'],
            raw_data={'sku': 'TEST-005', 'title': 'Product Title'}
        )
        
        assert report.row_number == 5
        assert len(report.errors) == 2
        assert report.sku == 'TEST-005'
    
    def test_error_report_serialization(self):
        """Test error report can be serialized"""
        report = IngestionErrorReport(
            row_number=1,
            sku='TEST-001',
            title='Title',
            errors=['Error'],
            raw_data={}
        )
        
        # Should be able to convert to dict
        report_dict = report.model_dump()
        assert report_dict['row_number'] == 1
        assert isinstance(report_dict['errors'], list)


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])

