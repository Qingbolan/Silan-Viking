"""
silan — thin forwarding shell for the `silan-viking` engine.

The Python implementation of this CLI has been retired; the package is
now only an entry-point shim. All commands forward to the Rust
`silan-viking` binary. See `silan/silan.py` for the forwarding logic.
"""

__version__ = "2.0.0"
__author__ = "Silan Hu"
__email__ = "Silan.Hu@u.nus.edu"
__description__ = "Thin wrapper that forwards the `silan` command to the silan-viking engine"
__url__ = "https://github.com/Qingbolan/Silan-Personal-Website"

from .silan import cli

__all__ = ["cli"]
