"""WSGI entry point — for gunicorn/waitress/etc."""

from gemstone_p.app import create_app

application = app = create_app()
