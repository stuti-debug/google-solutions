import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Import core modules
from core.firebase import init_firebase
from core.security import security_headers_middleware, require_auth
from core.app_globals import limiter

# Import routes (Blueprints)
from routes.clean import clean_bp
from routes.query import query_bp
from routes.data import data_bp
from routes.match import match_bp
from routes.priority import priority_bp
from routes.sitrep import sitrep_bp
from routes.alerts import alerts_bp
from routes.forecast import forecast_bp
from routes.reports import reports_bp

def _rate_limit_storage_uri():
    configured_uri = os.getenv("RATELIMIT_STORAGE_URI") or os.getenv("REDIS_URL")
    if configured_uri:
        return configured_uri

    app_env = (
        os.getenv("FLASK_ENV")
        or os.getenv("CRISISGRID_ENV")
        or os.getenv("APP_ENV")
        or "development"
    ).lower()
    if app_env in {"prod", "production"}:
        return "redis://localhost:6379/0"

    return "memory://"

def create_app():
    # 1. Load environment variables
    load_dotenv(override=True)

    # 2. Initialize Flask app
    app = Flask(__name__)
    
    # 3. Configure app
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB limit
    app.config["RATELIMIT_STORAGE_URI"] = _rate_limit_storage_uri()
    app.config["RATELIMIT_HEADERS_ENABLED"] = True
    
    # 4. Setup CORS
    CORS(app, resources={r"/*": {"origins": "*"}}, allow_headers=["Content-Type", "Authorization", "Access-Control-Allow-Credentials"])

    # 4b. Setup Flask-Limiter with Redis backend
    limiter.init_app(app)

    # 5. Initialize Firebase
    try:
        init_firebase()
    except Exception as e:
        app.logger.error(f"Firebase initialization failed: {e}")

    # 6. Register Blueprints
    app.register_blueprint(clean_bp)
    app.register_blueprint(query_bp)
    app.register_blueprint(data_bp)
    app.register_blueprint(match_bp)
    app.register_blueprint(priority_bp)
    app.register_blueprint(sitrep_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(forecast_bp)
    app.register_blueprint(reports_bp)

    # 7. Global Middlewares
    app.after_request(security_headers_middleware)
    app.before_request(require_auth)

    # 8. Basic Health Check
    @app.route('/health')
    def health():
        return jsonify({"status": "ok", "version": "2.0.0-modular"})

    return app

# Development Server Entry Point
if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)
