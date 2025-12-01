"""
Pytest configuration and shared fixtures for WatMarket tests.
"""

import pytest
import sys

# Ensure backend is in path
sys.path.insert(0, '/Users/jaedonvisva/side-projects/watmarket/backend')


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
