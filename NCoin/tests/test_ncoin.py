import unittest

from ncoin.chain import Chain
from ncoin.consensus import block_subsidy
from ncoin.constants import COIN, HALVING_INTERVAL, INITIAL_SUBSIDY, MAX_SUPPLY_NCOIN
from ncoin.crypto import KeyPair, hash160, random_private_key, sign, verify
from ncoin.mempool import Mempool
from ncoin.miner import mine_block
from ncoin.transaction import Transaction, TxInput, TxOutput
from ncoin.utxo import UTXOSet, validate_transaction
from ncoin.wallet import Wallet, address_from_pubkey_hash, pubkey_hash_from_address


class NCoinSmokeTests(unittest.TestCase):
    def test_reward_schedule_sums_to_cap(self):
        total = 0
        height = 0
        while True:
            subsidy = block_subsidy(height)
            if subsidy == 0:
                break
            total += subsidy * HALVING_INTERVAL
            height += HALVING_INTERVAL
        self.assertLessEqual(total, MAX_SUPPLY_NCOIN * COIN)
        self.assertLess(MAX_SUPPLY_NCOIN * COIN - total, COIN)
        self.assertEqual(block_subsidy(0), INITIAL_SUBSIDY)
        self.assertEqual(block_subsidy(HALVING_INTERVAL), INITIAL_SUBSIDY // 2)

    def test_signature_roundtrip(self):
        private_key = random_private_key()
        keypair = KeyPair(private_key)
        message_hash = hash160(b"ncoin") + b"\x00" * 12
        signature = sign(private_key, message_hash)
        self.assertTrue(verify(keypair.public_key, message_hash, signature))
        self.assertFalse(verify(keypair.public_key, b"\x01" * 32, signature))

    def test_address_roundtrip(self):
        wallet = Wallet.create()
        address = address_from_pubkey_hash(wallet.public_key_hash)
        self.assertEqual(pubkey_hash_from_address(address), wallet.public_key_hash)

    def test_signed_transaction_validates(self):
        sender = Wallet.create()
        receiver = Wallet.create()
        funding = Transaction(outputs=[TxOutput(10 * COIN, sender.public_key_hash)], coinbase_data=b"fund")
        utxo = UTXOSet()
        utxo.add(funding.txid(), 0, funding.outputs[0], height=1, coinbase=False)

        tx = Transaction(
            inputs=[TxInput(funding.txid(), 0)],
            outputs=[
                TxOutput(2 * COIN, receiver.public_key_hash),
                TxOutput(7 * COIN, sender.public_key_hash),
            ],
        )
        tx.sign_input(0, sender.keypair.private_key, funding.outputs[0])
        self.assertEqual(validate_transaction(tx, utxo, spend_height=2), COIN)

    def test_mine_and_add_block(self):
        chain = Chain()
        wallet = Wallet.create()
        block = mine_block(chain, Mempool(), wallet.public_key_hash)
        self.assertIsNotNone(block)
        self.assertTrue(chain.add_block(block))
        self.assertEqual(chain.height, 1)


if __name__ == "__main__":
    unittest.main()
