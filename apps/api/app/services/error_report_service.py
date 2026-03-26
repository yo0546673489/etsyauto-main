"""
Error Report Service
Generate and store error reports for ingestion batches
"""
import csv
import json
import io
import os
import logging
from typing import List, Tuple
from datetime import datetime

from app.schemas.ingestion import IngestionErrorReport

logger = logging.getLogger(__name__)


class ErrorReportService:
    """Service for generating and storing error reports"""
    
    def __init__(self, storage_path: str = "/tmp/ingestion_errors"):
        """
        Initialize error report service
        
        Args:
            storage_path: Base path for storing error reports
        """
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)
    
    def generate_csv_report(self, errors: List[IngestionErrorReport], batch_id: str) -> Tuple[str, str]:
        """
        Generate CSV error report
        
        Args:
            errors: List of error reports
            batch_id: Batch ID for filename
            
        Returns:
            Tuple of (file_path, file_url)
        """
        filename = f"errors_{batch_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        file_path = os.path.join(self.storage_path, filename)
        
        try:
            with open(file_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                
                # Write header
                writer.writerow([
                    'Row Number',
                    'SKU',
                    'Title',
                    'Errors',
                    'Raw Data'
                ])
                
                # Write error rows
                for error in errors:
                    errors_str = '; '.join(error.errors)
                    raw_data_str = json.dumps(error.raw_data, ensure_ascii=False) if error.raw_data else ''
                    writer.writerow([
                        error.row_number,
                        error.sku or '',
                        error.title or '',
                        errors_str,
                        raw_data_str
                    ])
            
            # Generate signed URL (for now, return file path)
            # In production, upload to S3/R2 and generate signed URL
            file_url = f"/api/products/ingestion/errors/{batch_id}?format=csv"
            
            return file_path, file_url
            
        except Exception as e:
            logger.error(f"Error generating CSV report: {str(e)}")
            raise
    
    def generate_json_report(self, errors: List[IngestionErrorReport], batch_id: str) -> Tuple[str, str]:
        """
        Generate JSON error report
        
        Args:
            errors: List of error reports
            batch_id: Batch ID for filename
            
        Returns:
            Tuple of (file_path, file_url)
        """
        filename = f"errors_{batch_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        file_path = os.path.join(self.storage_path, filename)
        
        try:
            report_data = {
                'batch_id': batch_id,
                'generated_at': datetime.now().isoformat(),
                'total_errors': len(errors),
                'errors': [error.model_dump() for error in errors]
            }
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(report_data, f, indent=2, ensure_ascii=False)
            
            # Generate signed URL
            file_url = f"/api/products/ingestion/errors/{batch_id}?format=json"
            
            return file_path, file_url
            
        except Exception as e:
            logger.error(f"Error generating JSON report: {str(e)}")
            raise

