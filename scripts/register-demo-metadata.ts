import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const registryAddress = process.env.REGISTRY_ADDRESS as `0x${string}`;
  const tokens = JSON.parse(process.env.TOKENS_JSON || "[]") as { address: `0x${string}`, name: string }[];

  if (!registryAddress || tokens.length === 0) {
    throw new Error("REGISTRY_ADDRESS and TOKENS_JSON must be set");
  }

  console.log(`Network: ${network.name}`);
  console.log(`Registry: ${registryAddress}`);

  const registry = await viem.getContractAt("AssetRegistry", registryAddress, {
    client: { public: publicClient, wallet: deployer },
  });

  for (const token of tokens) {
    console.log(`\nRegistering metadata for: ${token.name} (${token.address})`);

    // 1. Set Metadata (Main Info)
    const metadataUri = `ipfs://bafybeihdabc${token.name.replace(/\s+/g, "").toLowerCase()}demo123/metadata.json`;
    const metadataHash = keccak256(toBytes(`demo-metadata-hash-${token.name}`));
    
    console.log(` - Setting Metadata: ${metadataUri}`);
    const hash1 = await registry.write.setMetadata([token.address, metadataUri, metadataHash]);
    await publicClient.waitForTransactionReceipt({ hash: hash1 });

    // 2. Upsert Document (Legal Deed)
    const docId = keccak256(toBytes("LEGAL_DEED_V1"));
    const docName = "Official Property Deed";
    const docUri = `ipfs://bafybeihdoc${token.name.replace(/\s+/g, "").toLowerCase()}deed456/deed.pdf`;
    const docHash = keccak256(toBytes(`demo-deed-hash-${token.name}`));
    
    console.log(` - Upserting Document: ${docName}`);
    const hash2 = await registry.write.upsertDocument([
      token.address,
      docId,
      docName,
      docUri,
      docHash,
      "application/pdf",
      true // gated
    ]);
    await publicClient.waitForTransactionReceipt({ hash: hash2 });
  }

  console.log("\nDone. All demo metadata registered.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
