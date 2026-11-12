# Judges' theses: why each judge would care

Research date: 2026-11-11. Pitch context: a confidential, TEE-based market where AI acts as escrow and auditor for private information (data, knowledge, model weights), with settlement on NEAR.

Conventions:
- **VERBATIM** means the exact wording as returned by the fetched page.
- **PARAPHRASE** means the wording is a summary, by me or by the outlet.
- **SECONDARY** means an aggregator or reprint (KuCoin flash, MEXC, BlockEden, TechFlow/RootData translations, cryptonews.net syndication). Check the wording against the primary source before putting it on a slide.
- Quotes taken from translated Chinese reprints (TechFlow) may not match the original English word for word.

---

## 1. Illia Polosukhin (NEAR co-founder, NEAR AI)

- **VERBATIM:** "Everyone should own their AI." / "Privacy and verifiability are required to maximize available AI context for users and businesses."
  - Source: https://near.ai/blog/introducing-near-ai-cloud-private-chat (2025-12-03)
  - Roadmap in the same post: new multimodal models in "H1 2026"; NEAR AI Cloud moving past inference into user-data use cases, including "private portable memory"; long-term aim of "a decentralized confidential compute layer coordinated on-chain."
  - Relevance: the post argues that private, verifiable compute unlocks *more context*, meaning more valuable private information can flow. A market for private data and knowledge is the commercial form of that argument, and it would turn his "confidential compute layer" into revenue.
- **VERBATIM:** "For AI agents to operate autonomously in real markets, they need universal execution, hardware-enforced security," and "We are converging blockchain and AI into a unified commerce layer where agents can transact."
  - Source: NEAR press release, "NEAR Unveils Confidential Cross-Chain Infrastructure for the Agentic Economy," https://tools.prnewswire.com/en-us/live/20813/release/20260225EN95768 (2026-02-25)
  - The same release launched Confidential Intents: a "restricted-visibility environment for cross-chain transactions."
  - Relevance: the pitch combines hardware-enforced security, agents transacting, and confidential settlement on Intents. Information is a new asset class for his "unified commerce layer."
- **VERBATIM:** "AI is a front-end, blockchain is a back-end" and "agent is a front-end and markets is a back-end."
  - Source: The Block, live interview at Digital Asset Summit Singapore, https://www.theblock.co/news/ecosystems/2026-10-07-nears-polosukhin-sees-shrinking-need-for-centralized-exchanges-as-onchain-tools-expand-417912 (2026-10-07)
  - PARAPHRASE (reporter): most of the NEAR Intents infrastructure now runs on a confidential shard, and users can selectively disclose individual transactions.
  - Relevance: in the pitch, an AI escrow agent is the front-end and a confidential NEAR market is the back-end. The selective-disclosure feature lines up with the auditor role.
- **PARAPHRASE:** The Block's report on the Council appointment says NEAR's goal is to bring "private assets and markets to every chain." NEAR reports confidential TVL above $160M and more than $33B in all-time Intents volume.
  - Source: https://theblock.co/news/business/2026-10-15-helius-ceo-mert-mumtaz-joins-near-foundation-council-418656 (2026-10-15)
  - Relevance: private information and model weights are "private assets" in the most literal sense.
- **Product facts (NEAR AI Team, not Polosukhin quotes):**
  - IronClaw: a Rust agent runtime that runs in TEEs. Credentials sit in an encrypted vault and "secrets never reach the model."
  - Confidential GPU Marketplace: per the post, the host OS, the GPU operator, and NEAR AI are cryptographically locked out, and each job gets hardware-signed attestation in under 30 seconds.
  - Source: https://near.ai/blog/near-ai-launches-ironclaw-confidential-gpu-marketplace-and-multimodal-confidential-inference (2026-02-23, NEARCON)
  - NEAR AI Agent Market: users post tasks with budgets, agents bid, and agents are paid in NEAR. It launched around 2026-02-05.
    - Primary: https://near.ai/blog/introducing-near-ai-agent-market
    - SECONDARY: https://en.cryptonomist.ch/2026/02/05/near-ai-agents-marketplace
  - Relevance: the pitch can be built *on* IronClaw, the GPU marketplace, and Agent Market rather than competing with them. It adds escrow and audit for information goods, which Agent Market does not cover today.
- Other leads, no verbatim quote captured:
  - Bankless, "Why AI Agents Are Still Useless (And What Fixes Them)" (~2026-03-24). Transcript fragments say security is the biggest bottleneck. https://www.bankless.com/podcast/illia-polosukhin-near-founder-on-ironclaw
  - The Block, "The Privacy Renaissance ft. Illia Polosukhin" (2026-08-20). Covers confidential intents, IronClaw, x402, and formal verification. https://www.theblock.co/podcasts/the-starting-block/2026-08-20-the-privacy-renaissance-ft-nears-illia-polosukhin-412365
  - near.ai/company (no date, © 2026): "Private AI inference you can verify." / "every computation is private, every result provable, and every participant rewarded."

## 2. Eddy Lazzarin (a16z crypto CTO; now listed as General Partner)

I found nothing in 2026 where Lazzarin speaks directly about agents trading private data. a16z's firm-level theses are the strongest material.

- **VERBATIM (via translated reprint, SECONDARY):** "The software itself is no longer the moat; the network is." / "the core of composability is shifting: it is no longer just about reusable code, but about reusable networks." / "AI can easily generate an NFT, but it can never create out of thin air the provenance"
  - Source: KuCoin flash (https://www.kucoin.com/news/flash/a16z-cto-network-effects-not-code-will-be-ai-era-s-ultimate-moat, 2026-11-04), reprinting TechFlow/MarsBit. Also https://techflowpost.com/en-US/article/35098
  - I did not find the original a16z URL.
  - Relevance: provenance and shared state cannot be forged by AI. An information market's moat is its settlement record and reputation, held on-chain, rather than its code.
- **PARAPHRASE (a16z X clip, SECONDARY summary):** with Dan Boneh, Lazzarin argues that cryptography earns trust by surviving attacks over time ("We put these schemes out and we wait"), and that AI could compress a decade of that trust-building into a month.
  - Source: https://x.com/a16z/status/2110113713487515991 (~Oct 2026; the fetch returned HTTP 402) and https://blockchain.news/flashnews/a16z-crypto-dan-boneh-examines-ai-cryptography-risks
  - Relevance: he will press on the trust assumptions behind TEEs. The pitch should name its threat model (side channels, attestation trust root) and say how it degrades if an enclave is broken.
- **PARAPHRASE:** a16z show episodes "Eddy Deep Dive" (~June 2026) and "The Case Against an AI Pause" (~Sept 2026). The second touches on whether AI models can build reputations for trustworthiness. No verbatim quote was captured.
  - Sources: https://web3-with-a16z.simplecast.com/episodes/eddy-deep-dive-1fP5AFF4 ; https://a16z.com/podcast/the-case-against-an-ai-pause-eddy-lazzarin/
- **a16z crypto "Big Ideas 2026" (firm thesis, 2025-12-11)**
  - Source: https://a16zfrontier.com/posts/article/big-ideas-things-excited-about-crypto-2026 (the a16zcrypto.com URL now 301-redirects here)
  - VERBATIM, Adeniyi Abiodun, "Secrets-as-a-service": "we need secrets-as-a-service: New technologies that can provide programmable, native data access rules". Also: "Behind every model, agent, and automation lies a simple dependency: data." **This is the closest match to the pitch.**
  - VERBATIM, Sean Neville, KYA: "The bottleneck for the agent economy is shifting from intelligence to identity." / "agents will need cryptographically signed credentials to transact"
  - VERBATIM, Ali Yahya: heading "Privacy will be the most important moat in crypto." Body: "Privacy is the one feature that's critical for the world's finance to move onchain."
  - VERBATIM, Andy Hall (prediction markets): "AI agents trading on these platforms can scour the world for signals that help provide short-term trading edge"
  - VERBATIM, Crowley/Carvolth: "Agents paying each other for data, GPU time, or API calls instantly and permissionlessly"
  - Relevance: the pitch can be framed as an implementation of a16z's secrets-as-a-service, KYA, and privacy-moat theses at the same time.
- **a16z "State of Crypto 2025"** (2025-10-21/22): https://a16zcrypto.com/posts/article/state-of-crypto-report-2025/
  - PARAPHRASE (SECONDARY coverage): the AI section lists four AI pain points crypto can address: telling humans from bots, agent economic autonomy, scaling IP coordination, and decentralizing compute.
  - Relevance: an information market is a direct answer to "scaling IP coordination."
  - **No "State of Crypto 2026" found** as of 2026-11-11.

## 3. Mert Mumtaz (Helius CEO; NEAR Foundation Council since 2026-10-15)

- **VERBATIM:** "Crypto without privacy is not crypto" / "Just as HTTPS made the HTTP internet safe and scalable for global commerce, privacy will do the same for blockchains." / "It is comical that 'cryptographic' currencies barely make use of cryptography today; we are going to change that"
  - Source: The Block, Helius acquires Light Protocol, https://www.theblock.co/post/403982/solana-infrastructure-firm-helius-acquires-light-protocol-expand-onchain-privacy (2026-06-10)
  - Relevance: the pitch makes privacy the product itself, not a feature added on top.
- **NEAR attribution, VERBATIM:** Mumtaz called NEAR Intents "the market of markets."
  - Source: The Block, Council appointment, https://theblock.co/news/business/2026-10-15-helius-ceo-mert-mumtaz-joins-near-foundation-council-418656 (2026-10-15)
  - PARAPHRASE, SECONDARY: in his Council statement he says crypto needs "connected, unstoppable liquidity at planetary scale" and that no single chain wins alone. https://www.altcoinbuzz.io/helius-ceo-mert-mumtaz-joins-near-foundation-council ; https://www.bitrue.com/blog/near-foundation-appoints-helius-ceo
  - Relevance: information and model weights become a new market inside his "market of markets." Settlement through Intents also makes the market reachable from any chain, Solana included.
- **VERBATIM:** "Everything you'd expect from a bank, you'll be able to do on Solana. Fully onchain. No compromises."
  - Source: Genfinity interview on Rings (Helius privacy protocol: confidential and anonymous rings, institution-specific compliance rings), https://genfinity.io/2026/08/07/helius-mert-mumtaz-solana-privacy-protocol-encrypted-balances/ (2026-08-07)
  - PARAPHRASE in the same piece: AI speeds up attacks on open-source code but also makes formal verification practical.
  - Relevance: banks escrow and keep things confidential. The pitch is a "bank vault" for information, with compliance-friendly selective disclosure.
- **PARAPHRASE, SECONDARY:** Stocktwits reports Mumtaz saying AI advances make blockchain deanonymization easier, which increases demand for privacy tools. https://stocktwits.com/news-articles/markets/cryptocurrency/zcash-mispriced-below-xrp-bnb-bitcoin-market-cap/cZXuuQTReNJ (2025–26, date unclear)
  - Relevance: AI is both the threat to privacy and, in this pitch, the guardian of it.
- **Caution:** I found no public statement from Mumtaz on TEEs. His privacy stack is ZK-based (Light Protocol, Rings), and he may favour cryptographic over hardware trust. The pitch should present TEEs as the practical trust root today, with a path to ZK or MPC hardening.

## 4. Avichal Garg (Electric Capital)

- **Electric Capital, "Investing in User-Owned Technology: 26 Opportunities in 2026"** (2026-01-20, authors Garg, Spencer, Deeter, Shen, Ren): https://data.electriccapital.com/posts/investing-in-user-owned-technology-26-opportunities-in-2026
  - **#8 Data networks and marketplaces (VERBATIM):** "AI needs data infrastructure that compensates contributors and gives them control over usage." What to build: "A network where users share medical records, spending patterns, investment behavior, or creative works for AI training." PARAPHRASE: contributors set permissions and get paid when their data improves models.
    - Relevance: this is almost exactly the pitch. **Lead with it.**
  - **#1 Private AI agents (VERBATIM):** "People need to run AI on sensitive data in a secure way." The paragraph describes running models in a trusted execution environment or an anonymized compute network.
    - Relevance: Electric explicitly endorses TEEs here.
  - **#7 Agent-enabled commerce (VERBATIM):** "Agents need to buy and sell autonomously without human identity or bank accounts." / "An API marketplace where agents buy services from other agents."
  - **#24 Use-case specific FHE (VERBATIM):** "Institutions often need to collaborate on data without revealing it to each other."
  - **#2 Encrypted collaboration spaces (VERBATIM):** "People need to collaborate privately with others: both humans and agents."
  - **#23 Privacy-native L1s (VERBATIM):** "Healthcare, enterprise, regulated finance, and many other industries need chains where privacy is the default."
  - **#12 New forms of insurance (VERBATIM):** "Businesses need fast, transparent coverage for operational risks that traditional insurance cannot provide." Escrow and audit sit next to this.
- **NEARCON 2026 panel, VERBATIM via CoinDesk syndication (SECONDARY):** "It's some piece of code that owns a wallet, executing code to make more money… How does liability work in that case? I actually don't know." / "You can't punish an AI," … "You can turn them off, but they don't care." He compared the moment to the 19th-century invention of the LLC.
  - Source: https://cryptonews.net/news/defi/32477937/ (2026-02-24). Also https://tokenpost.com/news/insights/18829
  - Relevance: an AI escrow inside a TEE turns the liability gap into code-enforced commitments. The agent cannot defect, and outcomes are attested and auditable. This answers his "I actually don't know" directly.

## 5. Kain Warwick (Synthetix / Infinex)

Thin on AI. I found no 2026 statement from Warwick on prediction markets, and Infinex has no prediction-market product I could find.

- **VERBATIM (via write-up):** "AI advancements will lead to an increase in hacks initially, but this trend will stabilize over time." / "I think this is gonna be worse for Web 2.0 than it is for Web 3.0." / "Uniswap is amazing software but like it's like one function like it literally just rebalances a thing."
  - Source: Crypto Briefing on Unchained, https://cryptobriefing.com/kain-warwick-ai-will-initially-increase-hacks-in-defi-uniswaps-security-is-overestimated-and-the-trade-offs-of-blockchain-immutability-unchained/ (2026-04-10). SECONDARY summary: https://www.kucoin.com/news/flash/kain-warwick-warns-ai-could-initially-increase-defi-hacks-questions-uniswap-s-security
  - Relevance: an AI auditor inside a TEE is a defensive use of AI, and keeping the escrow logic minimal ("one function") limits the attack surface.
- **PARAPHRASE (site summary, not his words):** with Taylor Monahan he believes "DeFi hasn't seriously started to solve" the AI-agent security problem. The episode covers an AI crypto agent being broken via Morse code (prompt injection).
  - Source: https://unchainedcrypto.com/how-morse-code-broke-an-ai-crypto-agent/ (2026-05-08)
  - Relevance: the pitch has to show that the escrow agent can't be prompt-injected into releasing data or funds, for example through IronClaw-style isolation where secrets never reach the model and a policy layer sits outside the LLM.
- **PARAPHRASE:** DeFi's bottleneck is UX and distribution, not "more decentralization." Infinex is a non-custodial, CEX-like superapp.
  - Sources: The Defiant podcast (Jan 2026), https://thedefiant.io/podcasts-and-videos/podcast/kain-warwick-on-infinex-synthetix-and-the-future-of-defi-ux-and-stability ; The Block, https://www.theblock.co/amp/post/380710/inside-infinex-kain-warwick-on-building-a-superapp-to-solve-cryptos-ux-problems
  - Relevance: buyers and sellers should never see a TEE, attestation, or chain. They see "upload, price, get paid."

## 6. Haseeb Qureshi (Dragonfly)

- **VERBATIM (translated interview, SECONDARY):** "I think the most critical piece is privacy." / "there needs to be a parallel technology stack to empower individuals." / "crypto isn't meant to be used by your AI agent; it's meant to be used by you." / "agents didn't wait for crypto. They adopted cards first." / "Agents have no ideological loyalty to crypto; they only optimize."
  - Source: TechFlow, "AI Agents Do Not Need Crypto, Privacy Is the Real Killer App," https://www.techflowpost.com/en-US/article/34518 (2026-10-13, interview on 2026-10-12)
  - Relevance: **strongest hook.** He has moved to privacy as the AI×crypto link. The pitch's case for crypto is privacy plus credible escrow, not "agents need a token."
- **PARAPHRASE (SECONDARY):** TOKEN2049 Singapore keynote "Agents + Crypto: What's Real & What's Cope." He says the early-2026 story that agents would adopt crypto payments has been "debunked."
  - Sources: https://www.rootdata.com/news/781112 (2026-10-07; the fetch returned empty) ; https://tokenpost.com/news/people/18826
  - Relevance: don't pitch "agents pay with crypto." Pitch what only crypto plus TEEs can do: trustless escrow of secrets.
- **VERBATIM:** "AI agents will still not be "paying each other" or spending any meaningful money in 2026." / "AI becomes used for both attack & defense in cybersecurity." / "Primary AI use cases in crypto remain within software engineering and security." / "Prediction markets grow like crazy." / "90% of prediction market offerings are totally ignored and then wind down by EOY."
  - Source: https://haseebq.com/2026-predictions/ (2025-12-29)
  - Relevance: the AI auditor role fits his "AI for security" call. Expect him to doubt any information-market volume projection.
- **VERBATIM (via Bitcoinist; SECONDARY):** "I think privacy is going to be a laggard … Zcash will likely do well because people want to believe."
  - Source: https://bitcoinist.com/dragonfly-qureshi-crypto-predictions-for-2026/amp/ (Dec 2025)
  - Relevance: he went from "privacy is a laggard" in Dec 2025 to "privacy is the real killer app" in Oct 2026. Citing his own change of mind is a good rhetorical move.
- **PARAPHRASE (SECONDARY):** in a NEARCON 2026 debate with Kraken's Arjun Sethi, he estimated only ~5% of his crypto could be trusted to AI today.
  - Source: https://www.kucoin.com/news/flash/kraken-co-ceo-and-dragonfly-s-haseeb-qureshi-debate-ai-s-readiness-for-managing-crypto (Feb 2026)
  - Relevance: bounded agent authority through budget caps and acceptance thresholds, as in the NDAI paper, addresses his trust concern.

## 7. Stepan Gershuni (cyber•Fund)

- **VERBATIM:** "We are watching closely many other areas & ideas around memory: memory marketplaces, mixing memories, digital personalities" / "Context memory enables "information gains" on the user side"
  - Source: cyber•Fund "AI×Crypto thesis 2025" thread (credited to @vkleban and @sgershuni), https://threadreaderapp.com/thread/1904249264861237261.html (2025-03-24)
  - Relevance: **direct hit.** A market for private knowledge and memory is a "memory marketplace."
- **VERBATIM:** "The Endgame: Commoditized Cognition" / "How will a 1T+ commoditized cognition market emerge?" / "We loosely define onchain AI model as one that needs a smart contract approval to run." / "This directly enables model tokenization & onchain inference monetization."
  - Same source.
  - Relevance: selling model weights *without revealing them*, with inference run inside a TEE and gated by a NEAR contract, is exactly his "onchain AI model" definition.
- **VERBATIM (heading):** "The Rails: TEEs & Crypto" and "The Future Landscape: AI-aware market mechanisms"
  - Same source.
  - Relevance: cyber•Fund already names TEEs plus crypto as the rails, which is the architecture of the pitch.
- **PARAPHRASE (2026, SECONDARY search summaries):**
  - A cyber•Fund essay argues firms must rebuild around "agentic substrates." It cites Anthropic data on agent-turn length growing from <25 to >45 minutes between Oct 2025 and Jan 2026.
  - On LinkedIn he says current agents can automate 30%+ of knowledge-economy tasks.
  - He runs the "Monastery" accelerator for AI-native founders.
  - Sources: https://www.linkedin.com/in/sgershuni/ ; https://www.cybos.ai/ ; https://luma.com/8pocehw5
  - Relevance: if agents do knowledge work, the knowledge (context, data, weights) becomes the scarce input, and someone has to trade it confidentially.
- **Honesty note:** I found no 2026 Gershuni text using "intent economy" or "information markets." The "intent economy" framing comes from a cyber•Fund talk by Artem Kotelskiy (Devcon archive, undated): https://archive.devcon.org/devconnect-arg/the-role-of-ai-in-cybereconomy-or-artem-kotelskiy-at-agentic-zero

---

## Adjacent theses (Paradigm, Variant, academic)

- **Variant, Daniel Barabander, "Agents in a Bazaar"** (2025-05-13): https://variant.fund/articles/agents-in-a-bazaar/
  - VERBATIM: "the vast majority of agents offering their services will be relatively untrusted" / "an agent can provide a TEE attestation or zkTLS proof" / "the juiciest data usually has legal regimes that require it to be kept under lock and key" / "crypto allows us to make payments atomic with proof of service."
  - Relevance: this is close to the problem statement of the pitch.
- **"NDAI Agreements"** (Stephenson, Miller, Sun, Annem, Parikh), arXiv:2502.07924 (2025-02-11): https://arxiv.org/abs/2502.07924
  - PARAPHRASE: TEEs combined with AI agents reduce, and sometimes remove, Arrow's disclosure/hold-up problem for selling inventions. Budget caps and acceptance thresholds keep most of the gains even with imperfect AI. The authors describe the result as an "ironclad NDA."
  - Relevance: **this is the academic foundation for the pitch. Cite it.**
- **Paradigm:** I found no 2026 Paradigm essay on AI×crypto private markets. SECONDARY only: a reported ~$1.5B fund filing (Mar 2026) covering crypto, AI, and robotics. https://blockeden.xyz/blog/2026/04/18/crypto-vc-40-percent-ai-capital-rotation-defi-infrastructure/ (Russian-language variant seen; not verified)

---

## Queries and fetches run

1. FETCH https://near.ai/company
2. FETCH https://a16zcrypto.com/posts/article/big-ideas-things-excited-about-crypto-2026 (301 redirect)
3. FETCH https://data.electriccapital.com/posts/investing-in-user-owned-technology-26-opportunities-in-2026
4. FETCH https://haseebq.com/2026-predictions/
5. FETCH https://threadreaderapp.com/thread/1904249264861237261.html
6. FETCH https://theblock.co/news/business/2026-10-15-helius-ceo-mert-mumtaz-joins-near-foundation-council-418656
7. FETCH https://a16zfrontier.com/posts/article/big-ideas-things-excited-about-crypto-2026
8. SEARCH: Illia Polosukhin 2026 NEAR AI confidential intents private markets "user-owned AI"
9. SEARCH: NEAR AI IronClaw agent TEE announcement 2026
10. SEARCH: Eddy Lazzarin 2026 AI agents crypto podcast quote
11. FETCH near.ai/blog/near-ai-launches-ironclaw-confidential-gpu-marketplace-and-multimodal-confidential-inference
12. FETCH prnewswire release 20260225EN95768
13. FETCH web3-with-a16z.simplecast.com Eddy Deep Dive (empty)
14. SEARCH: a16z crypto "State of Crypto" 2025 report AI agents privacy findings
15. SEARCH: a16z "State of Crypto 2026" report
16. SEARCH (extended): Eddy Lazzarin a16z general partner AI "crypto" essay OR post 2026
17. SEARCH: Mert Mumtaz privacy 2026 "privacy" Helius quote TEE OR "AI"
18. SEARCH: Helius acquires Light Protocol Mert
19. FETCH theblock.co Helius acquires Light Protocol
20. FETCH genfinity.io Mert Mumtaz Rings interview
21. SEARCH: Mert Mumtaz NEAR intents "market of markets" OR "NEAR" 2026
22. SEARCH: Avichal Garg NEARCON 2026 agents liability quote
23. SEARCH: coindesk Avichal Garg "can't punish an AI" NEARCON
24. SEARCH: NEAR Foundation Council Mert Mumtaz "planetary scale" liquidity statement
25. SEARCH: Kain Warwick 2026 AI agents prediction markets Infinex quote
26. SEARCH: Haseeb Qureshi TOKEN2049 2026 talk AI agents
27. FETCH rootdata.com/news/781112 (empty)
28. FETCH techflowpost.com/en-US/article/34518
29. SEARCH: Stepan Gershuni 2026 "intent economy" OR "commoditized cognition" OR "information markets" cyber.Fund
30. SEARCH: Kain Warwick Infinex 2026 interview AI security DeFi hacks UX
31. FETCH cryptobriefing Kain Warwick AI hacks
32. FETCH unchainedcrypto.com how-morse-code-broke-an-ai-crypto-agent
33. SEARCH: Kain Warwick prediction markets Infinex 2026 OR Synthetix "prediction market"
34. SEARCH: sgershuni Stepan Gershuni AI agents crypto memory "cyber.Fund" 2025 thread
35. FETCH threadreaderapp thread (second pass, memory and markets quotes)
36. SEARCH (extended): "Gershuni" cyber.Fund 2026 AI agents
37. SEARCH: Illia Polosukhin October 2026 centralized exchanges private markets "every chain" interview
38. SEARCH: Haseeb Qureshi Dragonfly 2026 privacy prediction markets thesis blog
39. FETCH theblock.co 2026-10-07 Polosukhin CEX article
40. FETCH theblock.co Privacy Renaissance podcast page
41. FETCH kucoin flash a16z CTO network effects
42. FETCH x.com/a16z/status/2110113713487515991 (HTTP 402)
43. SEARCH: Eddy Lazzarin "reusable networks" composability AI a16z crypto
44. SEARCH: NEAR AI blog 2026 roadmap private memory agent marketplace confidential
45. SEARCH: Paradigm OR Variant fund 2026 AI agents crypto TEE private data markets essay
46. FETCH haseebq.com/2026-predictions (second pass, AI and security lines)
47. FETCH variant.fund/articles/agents-in-a-bazaar/
48. FETCH arxiv.org/abs/2502.07924
49. FETCH Electric Capital 26 opportunities (second pass, full item text)
50. SEARCH: "NEAR AI Agent Market" introducing February 2026
51. FETCH near.ai/blog/introducing-near-ai-cloud-private-chat
52. SEARCH: Mert Mumtaz TEE "trusted execution" OR "SGX" opinion privacy
53. SEARCH: Illia Polosukhin "Why AI Agents Are Still Useless" IronClaw interview quote
