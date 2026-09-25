/**
 * Reference data (not user data). Countries, currencies, account types and the
 * default crypto deposit rails. Sorted A–Z where the UI expects it.
 */

export const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina',
  'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
  'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo (Brazzaville)', 'Congo (Kinshasa)', 'Costa Rica', "Côte d'Ivoire", 'Croatia', 'Cuba',
  'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
  'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji',
  'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland',
  'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon',
  'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi',
  'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
  'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania',
  'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
  'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa',
  'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland',
  'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu',
  'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
].sort((a, b) => a.localeCompare(b));

export const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'COP', name: 'Colombian Peso', symbol: '$' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'ILS', name: 'Israeli New Shekel', symbol: '₪' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
].sort((a, b) => a.code.localeCompare(b.code));

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

export const ACCOUNT_TYPES = [
  'Crypto',
  'Investment',
  'Trading',
].sort((a, b) => a.localeCompare(b));

export const SECURITY_QUESTIONS = [
  'In what city were you born?',
  'What is the name of your first pet?',
  'What is your mother’s maiden name?',
  'What was the make of your first car?',
  'What was the name of your primary school?',
  'What is your favourite book?',
  'What street did you grow up on?',
  'What is your father’s middle name?',
].sort((a, b) => a.localeCompare(b));

/**
 * Default crypto deposit rails, ranked by how common they are. `address` is left
 * blank — the admin fills it in Platform Settings before deposits can be made.
 */
export const DEFAULT_CRYPTO_METHODS = [
  { symbol: 'BTC', name: 'Bitcoin', network: 'Bitcoin', address: '', memo: '', minDeposit: 50, confirmations: 2, rank: 1, active: true, instructions: 'Send only BTC to this address on the Bitcoin network.' },
  { symbol: 'ETH', name: 'Ethereum', network: 'ERC20', address: '', memo: '', minDeposit: 50, confirmations: 12, rank: 2, active: true, instructions: 'Send only ETH on the Ethereum (ERC20) network.' },
  { symbol: 'USDT', name: 'Tether', network: 'TRC20', address: '', memo: '', minDeposit: 20, confirmations: 20, rank: 3, active: true, instructions: 'Send only USDT on the Tron (TRC20) network. Wrong network = lost funds.' },
  { symbol: 'USDT', name: 'Tether', network: 'ERC20', address: '', memo: '', minDeposit: 20, confirmations: 12, rank: 4, active: true, instructions: 'Send only USDT on the Ethereum (ERC20) network.' },
  { symbol: 'USDC', name: 'USD Coin', network: 'ERC20', address: '', memo: '', minDeposit: 20, confirmations: 12, rank: 5, active: true, instructions: 'Send only USDC on the Ethereum (ERC20) network.' },
  { symbol: 'BNB', name: 'BNB', network: 'BEP20', address: '', memo: '', minDeposit: 20, confirmations: 15, rank: 6, active: true, instructions: 'Send only BNB / BEP20 tokens on the BNB Smart Chain.' },
  { symbol: 'XRP', name: 'XRP', network: 'XRP Ledger', address: '', memo: '', minDeposit: 20, confirmations: 1, rank: 7, active: true, instructions: 'A destination tag is required — include the memo/tag shown.' },
  { symbol: 'SOL', name: 'Solana', network: 'Solana', address: '', memo: '', minDeposit: 20, confirmations: 1, rank: 8, active: true, instructions: 'Send only SOL on the Solana network.' },
  { symbol: 'TRX', name: 'Tron', network: 'TRC20', address: '', memo: '', minDeposit: 20, confirmations: 20, rank: 9, active: true, instructions: 'Send only TRX on the Tron (TRC20) network.' },
  { symbol: 'LTC', name: 'Litecoin', network: 'Litecoin', address: '', memo: '', minDeposit: 20, confirmations: 6, rank: 10, active: true, instructions: 'Send only LTC on the Litecoin network.' },
];

export const KYC_DOCUMENT_TYPES = [
  'Passport',
  'National ID card',
  'Driver’s licence',
  'Proof of address (utility bill / bank statement)',
];
