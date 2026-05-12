# Triple M by NSF  
**Money Management Module**  

![Triple M Logo](Assets/logo/logo.png)

A comprehensive financial management application designed to track loans, expenses, and inventory with multi-currency support. Built with vanilla HTML, CSS, and JavaScript, Triple M provides a simple yet powerful solution for personal and small business financial tracking.

---

## 🌟 Features

### Core Functionality
- **Loan Tracking**: Track money given to others and received back
- **Borrowing Management**: Monitor loans taken and repayments made
- **Installment Plans**: Convert loans into structured installment schedules
- **Inventory Management**: Track goods bought and sold with profit/loss calculations
- **Expense Tracking**: Comprehensive wallet-based expense management system

### Advanced Features
- **Multi-Currency Support**: Native support for AED, SAR, and PKR with custom currency symbols
- **User Authentication**: Secure username/password login system
- **Data Export**: Download reports in PDF, JSON, or CSV format
- **Data Import**: Restore data from JSON or CSV backups
- **Database Sync**: Optional Supabase integration for cloud backup and sync
- **Real-time Statistics**: Live overview of financial status across all categories
- **Advanced Filtering**: Filter by status (Active/Closed), currency, and date ranges
- **Search Functionality**: Quick search across names, notes, and items
- **Wallet Management**: Create multiple wallets with automatic balance tracking
- **Money Transfer**: Transfer funds between wallets with currency conversion
- **Responsive Design**: Works seamlessly on desktop and mobile devices

---

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Optional: Supabase account for cloud database sync

### Installation

1. **Clone or Download** the repository:
   ```bash
   git clone <repository-url>
   cd Finance
   ```

2. **Open the Application**:
   - Simply open `index.html` in your web browser
   - No build process or server required!

3. **First Time Setup**:
   - Enter a username and password to create your account
   - Your data will be stored locally in encrypted ZIP files
   - Contact via WhatsApp at +923339004564 for account setup assistance

### Database Setup (Optional)

To enable Supabase cloud sync:

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL schema from `schema.sql` in your Supabase SQL Editor
3. Click "Connect Supabase" in the application
4. Enter your Supabase URL and anon key

---

## 📖 Usage Guide

### Authentication
- **Login**: Enter your username and password on the lock screen
- **Logout**: Click the "Log out" button in the header
- **Data Security**: Each user's data is stored in separate encrypted ZIP files

### Navigation Tabs
- **Expenses**: Track daily expenses by wallet and category
- **Loan Given / Received Back**: Manage loans you've given to others
- **Loan Taken / Returned Back**: Manage loans you've borrowed
- **Installment Plans**: View and manage installment schedules
- **Goods Bought / Sold**: Track inventory and sales

### Managing Loans

#### Adding a Loan Given
1. Navigate to "Loan Given / Received Back" tab
2. Click "New Entry" → "Loan Given"
3. Enter person name, currency, amount, and date
4. Optionally select a wallet to deduct from
5. Add notes if needed
6. Click "Save"

#### Recording Repayment Received
1. Click "New Entry" → "Received Back"
2. Select the related loan from the dropdown
3. Enter payment amount and date
4. Optionally select a wallet to add funds to
5. Click "Save"

### Managing Expenses

#### Creating a Wallet
1. Navigate to "Expenses" tab
2. Click "New Entry" → "Add Account"
3. Enter account name, type, currency, and opening balance
4. Click "Save Account"

#### Adding an Expense
1. Click "New Entry" → "Add Expense"
2. Enter item name, amount, currency
3. Select the wallet to deduct from
4. Choose expense type or add custom type
5. Click "Save Expense"

#### Adding Money to Wallet
1. Click "New Entry" → "Add Money"
2. Select the wallet
3. Enter amount and date
4. Click "Add Money"

### Managing Goods/Inventory

#### Adding Bought Items
1. Navigate to "Goods Bought / Sold" tab
2. Click "New Entry" → "Bought Item"
3. Enter item name, currency, actual price, quantity
4. Add purchase date and notes
5. Click "Save Bought Item"

#### Recording Sales
1. Click "New Entry" → "Sale Item"
2. Select an existing bought item or add new
3. Enter sold price, quantity, and date
4. Click "Save Sale Item"

### Data Export & Import

#### Exporting Data
- **Full Report**: Click "Download Full Report" → Choose PDF/JSON/CSV
- **Section Reports**: Click the download button in any section header

#### Importing Data
- **JSON Import**: Click "Import JSON" → Select your backup file
- **CSV Import**: Click "Import CSV" → Select your backup file

---

## 🏗️ Project Structure

```
Finance/
├── index.html              # Main application file
├── schema.sql              # Supabase database schema
├── README.md               # Project documentation
└── Assets/
    ├── app/
    │   ├── script.js       # Main JavaScript logic (5123 lines)
    │   ├── key.zip         # Encryption key file
    │   ├── key2.zip        # Secondary encryption key
    │   ├── nsfida.zip      # User-specific encryption
    │   └── keys.json       # Key configuration
    ├── logo/
    │   ├── logo.png        # Primary logo
    │   ├── logo1.png       # Alternate logo
    │   ├── logo2.png       # Header logo
    │   └── wallet_logos/   # Wallet icons
    └── style/
        ├── styles.css      # Main stylesheet (1314 lines)
        └── fonts/
            ├── AED.ttf     # Dirham currency symbol font
            └── SAR.otf     # Riyal currency symbol font
```

---

## 🛠️ Technology Stack

### Frontend
- **HTML5**: Semantic markup and structure
- **CSS3**: Custom styling with CSS variables and responsive design
- **Vanilla JavaScript**: No framework dependencies, pure JS implementation

### Libraries & Dependencies
- **jsPDF (v2.5.1)**: PDF generation for reports
- **jsPDF-AutoTable (v3.8.2)**: Table formatting in PDFs
- **Zip.js (v2.7.57)**: File compression and decompression

### Backend (Optional)
- **Supabase**: PostgreSQL database for cloud sync
- **PostgreSQL**: Relational database with RLS (Row Level Security)

### Fonts
- **Custom Currency Fonts**: AED.ttf and SAR.otf for authentic currency symbols
- **System Fonts**: Inter, system-ui for UI elements

---

## 🔒 Security Features

- **User Authentication**: Username/password based access control
- **Encrypted Storage**: Data stored in password-protected ZIP files
- **Session Management**: Secure session handling with localStorage
- **Input Validation**: Client-side validation for all forms
- **XSS Prevention**: Sanitized inputs and safe DOM manipulation
- **Database Security**: Row Level Security (RLS) policies in Supabase

---

## 📊 Data Model

### Loan Ledger Entries
- `id`: Unique identifier (UUID)
- `group_id`: Loan group identifier
- `direction`: 'given' or 'taken'
- `entry_kind`: 'principal', 'partial', or 'full'
- `person_name`: Borrower/lender name
- `currency`: AED, SAR, or PKR
- `principal_amount`: Original loan amount
- `action_amount`: Payment amount
- `loan_date`: Loan origination date
- `action_date`: Payment date
- `notes`: Additional information
- `created_at/updated_at`: Timestamps

### Expense Wallets
- Account name and type (Bank/Cash)
- Currency specification
- Opening balance
- Transaction history
- Current balance calculation

### Goods Inventory
- Item name and description
- Purchase details (price, quantity, date)
- Sales records (price, quantity, date)
- Stock status (In Stock / Sold)
- Profit/loss tracking

---

## 🎨 Customization

### Changing Currency Symbols
Edit the CSS in `Assets/style/styles.css` to modify currency display:
```css
.symbol-dirham { /* AED symbol styles */ }
.symbol-riyal { /* SAR symbol styles */ }
```

### Modifying Color Scheme
Update CSS variables in `:root`:
```css
:root {
  --primary: #2457d6;
  --success: #067647;
  --warning: #b54708;
  --danger: #b42318;
}
```

### Adding New Currencies
1. Add currency to `SUPPORTED_CURRENCIES` array in `script.js`
2. Update currency picker HTML in `index.html`
3. Add corresponding filter radio buttons
4. Include currency symbol in CSS

---

## 🐛 Troubleshooting

### Common Issues

**Login not working**
- Ensure username contains only letters, numbers, underscores, and hyphens
- Check that your ZIP files exist in the `Assets/app/` directory
- Clear browser cache and try again

**Data not saving**
- Check browser localStorage permissions
- Ensure sufficient disk space for ZIP file creation
- Try exporting data as JSON backup

**PDF download fails**
- Check internet connection (jsPDF loads from CDN)
- Disable ad blockers that might interfere
- Try a different browser

**Supabase sync not working**
- Verify Supabase URL and anon key are correct
- Ensure `schema.sql` has been executed in Supabase
- Check RLS policies allow public access

---

## 📝 Development

### Local Development
1. Make changes to `index.html`, `styles.css`, or `script.js`
2. Refresh browser to see changes
3. No build process required

### Testing
- Test authentication flow
- Verify CRUD operations for all data types
- Test export/import functionality
- Validate currency conversions
- Check responsive design on different screen sizes

### Contributing
Contributions are welcome! Please ensure:
- Code follows existing style conventions
- New features include appropriate comments
- Testing is performed before submitting
- Documentation is updated for new features

---

## 📄 License

This project is developed and maintained by Nadeem Shahzad Fida.  
Contact: +923339004564 (WhatsApp)  
Facebook: [Nadeem Shahzad Fida](https://facebook.com/nadeemshahzadfida)

---

## 🙏 Acknowledgments

- **jsPDF** for PDF generation capabilities
- **Zip.js** for file compression functionality
- **Supabase** for providing the backend database solution
- Custom currency fonts for authentic symbol rendering

---

## 📞 Support

For account setup, technical support, or feature requests:
- **WhatsApp**: +923339004564
- **Facebook**: [Nadeem Shahzad Fida](https://facebook.com/nadeemshahzadfida)

---

## 🗺️ Roadmap

### Planned Features
- [ ] Mobile app version (React Native)
- [ ] Multi-language support
- [ ] Advanced reporting with charts
- [ ] Recurring expense automation
- [ ] Budget planning tools
- [ ] Receipt scanning and OCR
- [ ] Bank API integration
- [ ] Collaboration features for teams

---

<div align="center">

**Built with ❤️ by Nadeem Shahzad Fida**

*Money Management Module - Simplifying Financial Tracking*

</div>
