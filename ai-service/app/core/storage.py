"""Storage abstraction for report and article files.

- Development: writes to local filesystem under ai-service/reports/
- Production: uploads to S3 bucket
"""

from __future__ import annotations

import abc
from pathlib import Path

import structlog

from app.config import Settings, get_settings

logger = structlog.get_logger()

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # ai-service/


class StorageBackend(abc.ABC):
    """Abstract storage interface."""

    @abc.abstractmethod
    def write_text(self, key: str, content: str, content_type: str = "text/plain") -> str:
        """Write text content. Returns the storage path/URL."""

    @abc.abstractmethod
    def write_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Write binary content (e.g. images). Returns the storage path/URL."""

    @abc.abstractmethod
    def read_text(self, key: str) -> str:
        """Read text content by key."""

    @abc.abstractmethod
    def exists(self, key: str) -> bool:
        """Check if a key exists."""


class LocalStorage(StorageBackend):
    """Local filesystem storage under ai-service/."""

    def __init__(self, base_dir: Path = BASE_DIR) -> None:
        self.base_dir = base_dir

    def write_text(self, key: str, content: str, content_type: str = "text/plain") -> str:
        path = self.base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        logger.debug("LocalStorage: written", path=str(path))
        return key

    def write_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        path = self.base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        logger.debug("LocalStorage: written bytes", path=str(path), size=len(data))
        return key

    def read_text(self, key: str) -> str:
        path = self.base_dir / key
        return path.read_text(encoding="utf-8")

    def exists(self, key: str) -> bool:
        return (self.base_dir / key).exists()


class S3Storage(StorageBackend):
    """AWS S3 storage backend."""

    def __init__(self, bucket: str, region: str, prefix: str) -> None:
        import boto3

        self.bucket = bucket
        self.prefix = prefix
        self.client = boto3.client("s3", region_name=region)

    def _full_key(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key

    def write_text(self, key: str, content: str, content_type: str = "text/plain") -> str:
        full_key = self._full_key(key)
        self.client.put_object(
            Bucket=self.bucket,
            Key=full_key,
            Body=content.encode("utf-8"),
            ContentType=content_type,
        )
        s3_path = f"s3://{self.bucket}/{full_key}"
        logger.debug("S3Storage: uploaded", s3_path=s3_path)
        return s3_path

    def write_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        full_key = self._full_key(key)
        self.client.put_object(
            Bucket=self.bucket,
            Key=full_key,
            Body=data,
            ContentType=content_type,
        )
        s3_path = f"s3://{self.bucket}/{full_key}"
        logger.debug("S3Storage: uploaded bytes", s3_path=s3_path, size=len(data))
        return s3_path

    def read_text(self, key: str) -> str:
        full_key = self._full_key(key)
        response = self.client.get_object(Bucket=self.bucket, Key=full_key)
        return response["Body"].read().decode("utf-8")

    def exists(self, key: str) -> bool:
        import botocore.exceptions

        full_key = self._full_key(key)
        try:
            self.client.head_object(Bucket=self.bucket, Key=full_key)
            return True
        except botocore.exceptions.ClientError:
            return False


def get_storage(settings: Settings | None = None) -> StorageBackend:
    """Return the appropriate storage backend based on APP_ENV."""
    if settings is None:
        settings = get_settings()

    if settings.is_production and settings.S3_BUCKET:
        logger.info(
            "Using S3 storage",
            bucket=settings.S3_BUCKET,
            prefix=settings.S3_PREFIX,
        )
        return S3Storage(
            bucket=settings.S3_BUCKET,
            region=settings.S3_REGION,
            prefix=settings.S3_PREFIX,
        )

    logger.info("Using local filesystem storage", base_dir=str(BASE_DIR))
    return LocalStorage(BASE_DIR)
