# CrisisGrid - AI-Powered Data Cleaning Pipeline

CrisisGrid is an intelligent data cleaning pipeline designed specifically for disaster relief and humanitarian organizations. It automatically cleans, standardizes, and structures messy CSV/Excel files using Google's Gemini AI.

## Features

- **AI-Powered Column Mapping**: Automatically maps messy column names to standardized schemas
- **Data Type Detection**: Identifies beneficiary, inventory, and donor datasets
- **Intelligent Cleaning**: 
  - Normalizes district names and abbreviations
  - Fixes date formats and numeric fields
  - Removes duplicates and invalid records
  - Handles missing values and null tokens
- **Multiple File Formats**: Supports CSV, Excel (.xlsx, .xls)
- **Web Interface**: Flask-based web application for easy file uploads
- **Progress Tracking**: Real-time cleaning progress updates

## Supported Data Types

### Beneficiary Data
- Personal information (name, phone, gender)
- Location data (district, village)
- Household details (household_size, need_type)
- Registration dates

### Inventory Data
- Item information (name, category, quantity)
- Storage details (warehouse, location)
- Expiry dates and last updated timestamps

### Donor Data
- Donor information (name, type, contact)
- Donation details (amount, currency, date)
- Location information

## Quick Start

### Prerequisites
- Python 3.8+
- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/crisisgrid.git
cd crisisgrid
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

6. Run the web application:
```bash
python app.py
```

5. Open your browser and navigate to `http://localhost:8000`

### Command Line Usage

You can also use the pipeline directly from the command line:

```bash
python cleaning_pipeline.py your_file.csv
```

## API Usage

### Upload and Clean File
```python
import requests

# Upload file
with open('your_file.csv', 'rb') as f:
    files = {'file': f}
    response = requests.post('http://localhost:8000/clean', files=files)

# Get session status
session_id = response.json()['session_id']
status = requests.get(f'http://localhost:8000/status/{session_id}')
```

## Configuration

### Environment Variables
- `GEMINI_API_KEY`: Your Google Gemini API key (required)
- `FIREBASE_SERVICE_ACCOUNT_KEY_PATH`: Path to Firebase service account JSON (required)
- `HOST`: Server host (default: localhost)
- `PORT`: Server port (default: 8000)

### File Type Detection
The system automatically detects file types based on:
- Column names and patterns
- Data content and structure
- AI-powered classification when needed

## Data Cleaning Process

1. **File Reading**: Supports multiple encodings and formats
2. **Header Normalization**: Cleans and standardizes column names
3. **Type Detection**: Identifies beneficiary/inventory/donor data
4. **AI Mapping**: Uses Gemini to map columns to canonical schema
5. **Data Cleaning**: 
   - Null token handling
   - District name normalization
   - Date and numeric formatting
   - Duplicate removal
6. **Validation**: Ensures required fields are present
7. **Output**: Returns cleaned, structured data

## Project Structure

```
crisisgrid/
|-- cleaning_pipeline.py      # Core cleaning pipeline
|-- app.py                  # Web application entry point
|-- config.py               # Configuration settings
|-- requirements.txt        # Python dependencies
|-- .env.example           # Environment variables template
|-- core/                  # Application configuration and setup
|-- routes/                # Blueprint route definitions
|-- services/              # Core services
|   |-- ai_mapper.py       # Gemini AI integration
|   |-- cleaner.py         # Data cleaning logic
|   |-- session_store.py   # Session management
|-- src/                   # Frontend assets
|-- sample.csv            # Sample data for testing
```

## Development

### Running Tests
```bash
pytest
```

### Testing AI Integration
```bash
python test_gemini.py
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the documentation
- Review the sample data format

## Privacy & Security

- API keys are stored securely in environment variables
- No sensitive data is logged or stored permanently
- Files are processed in memory and not saved to disk
- Supports data anonymization options

---

**CrisisGrid** - Making disaster relief data management easier through AI.
