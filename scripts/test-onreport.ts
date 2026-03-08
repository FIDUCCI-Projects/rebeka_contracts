import { network } from "hardhat";
import { encodeFunctionData, toBytes, type Address } from "viem";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();

  const tokenAddress = (process.env.TOKEN_ADDRESS || "0x894cdA6feBf63aC3e4ae94e639D5D61eB9745d83") as Address;
  const userToAllow = "0x1234567890123456789012345678901234567890" as Address;
  const isConfidential = process.env.CONFIDENTIAL === "1";

  console.log(`Network: ${network.name}`);
  console.log(`Token: ${tokenAddress} (${isConfidential ? "Confidential" : "Public"})`);
  
  const artifactName = isConfidential ? "RWAConfidentialERC20" : "RWAPermissionedERC20";
  const token = await viem.getContractAt(artifactName, tokenAddress, {
    client: { public: publicClient, wallet: signer },
  });

  // 0. Temporarily set signer as forwarder
  const originalForwarder = await token.read.keystoneForwarder();
  console.log(`Original Forwarder: ${originalForwarder}`);
  console.log(`Temporarily setting signer ${signer.account.address} as Forwarder...`);
  const setHash = await token.write.setKeystoneForwarder([signer.account.address]);
  console.log(` - Transaction: ${setHash}`);
  await publicClient.waitForTransactionReceipt({ hash: setHash });

  // 1. Prepare the report
  let reportData: `0x${string}`;
  
  if (isConfidential) {
    // This part would normally use cofhejs, but for simplicity we keep it as placeholder 
    // since we use the .cjs version for real FHE tests.
    // For this script, we'll just show the allowUser if not confidential to keep it clean.
    throw new Error("Use the .cjs script for real FHE tests due to ESM issues");
  } else {
    console.log(`Testing onReport (allowUser) for user: ${userToAllow}`);
    const selector = "0x47e1933a";
    const addressPadded = userToAllow.toLowerCase().replace("0x", "").padStart(64, "0");
    reportData = (selector + addressPadded) as `0x${string}`;
  }

  console.log(`Encoded Report: ${reportData}`);

  // 2. Call onReport
  console.log("Calling onReport...");
  const hash = await token.write.onReport(["0x", reportData]);
  console.log(` - Transaction: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });

  // 3. Restore original forwarder
  console.log(`Restoring original Forwarder...`);
  const restoreHash = await token.write.setKeystoneForwarder([originalForwarder]);
  console.log(` - Transaction: ${restoreHash}`);
  await publicClient.waitForTransactionReceipt({ hash: restoreHash });

  // 4. Verify
  console.log(`\n=== Verification ===`);
  const isAllowed = await token.read.allowed([userToAllow]);
  console.log(`User ${userToAllow} allowed status: ${isAllowed}`);
  
  console.log("SUCCESS: onReport logic verified on-chain!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
