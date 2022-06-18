const anchor = require("@project-serum/anchor");
const chainlink = require("@chainlink/solana-sdk");

process.env.ANCHOR_WALLET = "./id.json";
const { PublicKey } = anchor.web3;

const FEEDS = {
  SOLANA: new PublicKey("CcPVS9bqyXbD9cLnTbhhHazLsrua8QMFUHTutPtjyDzq"),
  USDC: new PublicKey("7CLo1BY41BHAVnEs57kzYMnWXyBJrVEBPpZyQyPo2p1G"),
  USDT: new PublicKey("76npM99oWkDXdepEJLXc3chmya2n1tEZzqfU2n67nywS"),
};

const CHAINLINK_PROGRAM_ID = new anchor.web3.PublicKey(
  "cjg3oHmg9uuPsP8D6g29NWvhySJkdYdAo9D25PRbKXJ"
);

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const conn = new anchor.web3.Connection(
  process.env.ANCHOR_PROVIDER_URL,
  "finalized"
);

function parseLogMessage(dataFeed, logMessages) {
  return new Promise((resolve) => {
    dataFeed._parser.parseLogs(logMessages, (log) => {
      if (log.name != "NewTransmission") {
        return;
      }
      let { answer } = chainlink.OCR2Feed.parseLog(log);
      resolve(answer.toNumber());
    });
  });
}

function getLatestRate(feedId) {
  return new Promise(async (resolve) => {
    const dataFeed = await chainlink.OCR2Feed.load(
      CHAINLINK_PROGRAM_ID,
      provider
    );

    const signatures = await conn.getSignaturesForAddress(
      feedId,
      {},
      "finalized"
    );
    for (let i = 0; i < signatures.length; i++) {
      const { signature, err } = signatures[i];
      if (err) {
        continue;
      }
      const tx = await conn.getParsedTransaction(signature);
      const [inst] = tx.transaction.message.instructions;
      if (!inst.programId.equals(CHAINLINK_PROGRAM_ID)) {
        continue;
      }
      const out = await parseLogMessage(dataFeed, tx.meta.logMessages);
      return resolve(out);
    }
  });
}

exports.price = async (req, res) => {
  const { id = "" } = req.query;
  const feedId = FEEDS[id.toUpperCase()];
  if (!feedId) {
    return res.status(400).send({ error: "unknown id" });
  }
  const data = await getLatestRate(feedId);
  res.send({ data });
};
