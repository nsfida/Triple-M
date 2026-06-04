"""Network and monetary constants for NCoin."""

COIN_NAME = "NCoin"
COIN = 100_000_000

MAX_SUPPLY_NCOIN = 15_000_000
MAX_MONEY = MAX_SUPPLY_NCOIN * COIN

INITIAL_SUBSIDY = 50 * COIN
HALVING_INTERVAL = 150_000

TARGET_BLOCK_SPACING = 10 * 60
DIFFICULTY_ADJUSTMENT_INTERVAL = 2_016
MAX_FUTURE_BLOCK_TIME = 2 * 60 * 60
MEDIAN_TIME_SPAN = 11
COINBASE_MATURITY = 100

PROTOCOL_VERSION = 1
DEFAULT_PORT = 8338

# Bitcoin-style compact difficulty. This bootstrap target is intentionally
# reachable for a fresh NCoin network while still exercising real PoW.
INITIAL_BITS = 0x1F00FFFF

GENESIS_TIMESTAMP = 1_780_531_200
GENESIS_MESSAGE = b"The Times 04/Jun/2026 NCoin genesis"

# Chosen so Base58Check addresses are visually distinct from Bitcoin.
ADDRESS_VERSION = 0x35
