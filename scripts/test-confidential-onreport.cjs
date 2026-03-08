/**
 * Helper CJS para probar onReport en un token confidencial.
 */
const { createPublicClient, createWalletClient, http, encodeFunctionData } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { arbitrumSepolia } = require("viem/chains");
const { cofhejs, Encryptable } = require("cofhejs/node");

function getEnv(name, fallback) {
  const v = process.env[name];
  if (v) return v;
  const net = process.env.ENCRYPT_FOR_NETWORK || "arbitrumSepolia";
  const prefix = net.replace(/([A-Z])/g, "_$1").toUpperCase().replace(/^_/, "");
  const alt = process.env[prefix + "_" + name];
  return alt || fallback;
}

async function main() {
  const rpcUrl = getEnv("RPC_URL") || process.env.ARBITRUM_SEPOLIA_RPC_URL;
  const pkHex = getEnv("PRIVATE_KEY") || process.env.ARBITRUM_SEPOLIA_PRIVATE_KEY;
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const userToAllow = process.env.USER_TO_ALLOW_AND_MINT || "0x1234567890123456789012345678901234567890";

  if (!rpcUrl || !pkHex || !tokenAddress) {
    process.stderr.write("Falta RPC_URL, PRIVATE_KEY o TOKEN_ADDRESS\n");
    process.exit(1);
  }

  const chain = arbitrumSepolia;
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const account = privateKeyToAccount(pkHex.startsWith("0x") ? pkHex : `0x${pkHex}`);
  const walletClient = createWalletClient({ account, chain, transport });

  console.log(`Initializing cofhejs...`);
  const initResult = await cofhejs.initializeWithViem({
    viemClient: publicClient,
    viemWalletClient: walletClient,
    environment: "TESTNET",
  });

  if (!initResult.success) {
    process.stderr.write("cofhejs init failed: " + (initResult.error?.message || "unknown") + "\n");
    process.exit(1);
  }

  // 0. Temporarily set signer as forwarder
  console.log(`Temporarily setting signer as Forwarder...`);
  const setHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: [{ name: 'setKeystoneForwarder', type: 'function', inputs: [{ name: 'forwarder', type: 'address' }], outputs: [] }],
    functionName: 'setKeystoneForwarder',
    args: [account.address],
  });
  console.log(` - Transaction: ${setHash}`);
  await publicClient.waitForTransactionReceipt({ hash: setHash });

  const mintAmount = 100n;
  console.log(`Encrypting amount: ${mintAmount}...`);
  const encryptResult = await cofhejs.encrypt([Encryptable.uint128(mintAmount)]);

  if (!encryptResult.success || !encryptResult.data?.[0]) {
    process.stderr.write("Encrypt failed: " + (encryptResult.error?.message || "no data") + "\n");
    process.exit(1);
  }

  const enc = encryptResult.data[0];
  const signature = typeof enc.signature === "string" && !enc.signature.startsWith("0x") ? "0x" + enc.signature : enc.signature;

  console.log("Preparing report data...");
  const reportData = encodeFunctionData({
    abi: [
        {
            name: 'mintEncrypted',
            type: 'function',
            inputs: [
                { name: 'to', type: 'address' },
                {
                    name: 'encryptedAmount',
                    type: 'tuple',
                    components: [
                        { name: 'ctHash', type: 'uint256' },
                        { name: 'securityZone', type: 'uint32' },
                        { name: 'utype', type: 'uint8' },
                        { name: 'signature', type: 'bytes' }
                    ]
                }
            ],
            outputs: []
        }
    ],
    functionName: 'mintEncrypted',
    args: [
        userToAllow,
        {
            ctHash: BigInt(enc.ctHash.toString()),
            securityZone: enc.securityZone,
            utype: enc.utype,
            signature: signature
        }
    ]
  });

  console.log("Calling onReport...");
  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: [{ name: 'onReport', type: 'function', inputs: [{ name: 'metadata', type: 'bytes' }, { name: 'report', type: 'bytes' }], outputs: [] }],
    functionName: 'onReport',
    args: ["0x", reportData],
  });
  console.log(` - Transaction: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });

  // 3. Restore original forwarder
  console.log(`Restoring original Forwarder...`);
  const restoreHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: [{ name: 'setKeystoneForwarder', type: 'function', inputs: [{ name: 'forwarder', type: 'address' }], outputs: [] }],
    functionName: 'setKeystoneForwarder',
    args: ["0x76c9cf548b4179F8901cda1f8623568b58215E62"],
  });
  console.log(` - Transaction: ${restoreHash}`);
  await publicClient.waitForTransactionReceipt({ hash: restoreHash });

  console.log("\n=== Success ===");
  console.log("On-chain confidential logic verified via onReport!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
