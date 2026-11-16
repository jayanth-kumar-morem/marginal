'use client';

/**
 * `/sell` (E13.2, D1 and D7; SDD §3.23).
 *
 * Seven steps, in the order the protocol forces: a file, the canonical bytes and their commitment,
 * the parameters, `create_listing` and provisioning, the seal and upload, the pins, and
 * `publish_listing`. Each one is enabled only once the one before it has actually succeeded,
 * because every step depends on something the last one produced — a commitment, a listing id, a
 * `pk_L`, a ciphertext hash — and offering a step that cannot work is how a seller ends up with a
 * listing nothing can open.
 *
 * What runs where is the whole design. The plaintext, the canonicalisation, the commitment, the
 * DEK and both seals are **in this tab** (SDD §3.2). Borsh and `validate_spec` are the core's,
 * reached through `/api/encode`, because the core is wasm loaded from disk and because nothing may
 * re-implement a layout the contract reads. The chain is read through server actions rather than
 * from the browser, so the page works under the app's own CSP (`connect-src 'self'`). And every
 * state change is signed by the seller's own wallet: this app never holds a key.
 */
import { useEffect, useState } from 'react';

import { canonicalise, claims as splitClaims, goodCommitment, salt, toHex } from '@marginal/sdk';

import { StepCanonical } from '@/components/sell/step-canonical';
import { StepCreate } from '@/components/sell/step-create';
import { StepFile } from '@/components/sell/step-file';
import { StepParameters } from '@/components/sell/step-parameters';
import { StepPins } from '@/components/sell/step-pins';
import { StepPublish, type PayoutChoice } from '@/components/sell/step-publish';
import { StepRoomSealed } from '@/components/sell/step-room-sealed';
import { StepSeal } from '@/components/sell/step-seal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper';
import { useWallet } from '@/components/wallet';
import { errorCode, settled } from '@/lib/chain';
import type { KeyMode, Listing } from '@/lib/records';
import {
  DEFAULT_FORM,
  baseUnits,
  beginProvisioningTx,
  createListingTx,
  encode,
  encodeArg,
  listingSpecJson,
  publishListingTx,
  publishSpecJson,
  sealAndUpload,
  sealPublicKey,
  sellSteps,
  sendSellCall,
  setPinsTx,
  uploadBlob,
  type BlobRefJson,
  type Payout,
  type PayoutQuoteInput,
  type SealTarget,
  type Sealed,
  type SellForm,
} from '@/lib/sell';

/** What a server action answers: the value, or the reason it could not be had. */
export type ActionResult<T> = { readonly ok: T } | { readonly error: string };

/** The canonical document, and everything derived from it in this tab. */
interface CanonicalDocument {
  readonly name: string;
  readonly canonical: string;
  readonly claims: readonly string[];
  readonly saltHex: string;
  readonly commitment: string;
}

export interface SellFees {
  readonly listing: string;
  readonly publish: string;
  readonly pins: string | null;
}

export function SellWizard({
  clearing,
  keypolicy,
  keyMode,
  token,
  fees,
  measurements,
  readListing,
  findListing,
  findSealTarget,
  askQuote,
}: {
  clearing: string;
  keypolicy: string;
  /** This deployment's key release (SDD §2.7, §3.12.7), from the manifest — never the seller's. */
  keyMode: KeyMode;
  token: string;
  fees: SellFees;
  measurements: readonly string[];
  readListing: (id: number) => Promise<ActionResult<Listing | null>>;
  findListing: (seller: string) => Promise<ActionResult<Listing | null>>;
  /** The one attested room a RoomSealed listing binds to, or why there is none. */
  findSealTarget: () => Promise<ActionResult<SealTarget>>;
  askQuote: (input: PayoutQuoteInput) => Promise<ActionResult<string | null>>;
}) {
  const wallet = useWallet();
  const steps = sellSteps(keyMode);
  const roomSealed = keyMode === 'RoomSealed';
  const [step, setStep] = useState(1);

  const [doc, setDoc] = useState<CanonicalDocument | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);

  const [form, setForm] = useState<SellForm>(DEFAULT_FORM);
  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);
  const [specBase64, setSpecBase64] = useState<string | null>(null);

  const [listing, setListing] = useState<Listing | null>(null);
  const [chainBusy, setChainBusy] = useState<string | null>(null);
  const [chainProblem, setChainProblem] = useState<string | null>(null);

  const [sealing, setSealing] = useState(false);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [ciphertext, setCiphertext] = useState<BlobRefJson | null>(null);
  const [sealProblem, setSealProblem] = useState<string | null>(null);

  // RoomSealed only: the room this listing would bind to, resolved before anything is created.
  const [target, setTarget] = useState<SealTarget | null>(null);
  const [targetProblem, setTargetProblem] = useState<string | null>(null);

  const [follow, setFollow] = useState(true);
  const [hashes, setHashes] = useState('');
  const [pinsBusy, setPinsBusy] = useState(false);
  /** Step 6 is done: the pins are stored (CKD), or the disclosure is acknowledged (RoomSealed). */
  const [keysDone, setKeysDone] = useState(false);
  const [pinsProblem, setPinsProblem] = useState<string | null>(null);

  const [payout, setPayout] = useState<PayoutChoice>({
    route: 'NearAccount',
    account: '',
    chain: 'solana',
    asset: 'USDC',
    address: '',
    destinationAsset: '',
  });
  const [publishBase64, setPublishBase64] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishProblem, setPublishProblem] = useState<string | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteProblem, setQuoteProblem] = useState<string | null>(null);

  const signable = wallet.accountId !== null;
  const sealTo = sealPublicKey(keyMode, listing, target);

  /**
   * The room check, before anything is created or uploaded. RoomSealed binds a listing to one room
   * (SDD line 1955), so a deployment with none or several has no listing to offer — and the seller
   * learns that here rather than after paying for a listing nothing can open.
   */
  useEffect(() => {
    if (!roomSealed) return;
    let live = true;
    findSealTarget()
      .then((result) => {
        if (!live) return;
        if ('error' in result) {
          setTargetProblem(result.error);
          return;
        }
        setTarget(result.ok);
        setTargetProblem(null);
      })
      .catch((error: unknown) => {
        if (live) setTargetProblem(errorCode(error));
      });
    return () => {
      live = false;
    };
  }, [roomSealed, findSealTarget]);

  // The seller's own account is the obvious NEAR payout, and it is only a default: the field stays
  // editable, because proceeds may be meant for a treasury rather than the signing key.
  useEffect(() => {
    const account = wallet.accountId;
    if (account !== null) setPayout((current) => (current.account === '' ? { ...current, account } : current));
  }, [wallet.accountId]);

  /** The publish argument, rebuilt whenever anything it carries changes. */
  useEffect(() => {
    if (doc === null || ciphertext === null) return;
    const route: Payout =
      payout.route === 'NearAccount'
        ? { route: 'NearAccount', account: payout.account }
        : { route: 'DryQuote', chain: payout.chain, asset: payout.asset, address: payout.address };
    let live = true;
    try {
      encodeArg('publish_spec_encode', publishSpecJson(doc.commitment, ciphertext, route))
        .then((base64) => {
          if (live) {
            setPublishBase64(base64);
            setPublishProblem(null);
          }
        })
        .catch((error: unknown) => {
          if (live) setPublishProblem(errorCode(error));
        });
    } catch (error: unknown) {
      setPublishBase64(null);
      setPublishProblem(errorCode(error));
    }
    return () => {
      live = false;
    };
  }, [doc, ciphertext, payout]);

  const onFile = (file: File): void => {
    setFileProblem(null);
    file
      .arrayBuffer()
      .then(async (buffer) => {
        const canonical = canonicalise(file.name, new Uint8Array(buffer));
        const pinch = await salt();
        setDoc({
          name: file.name,
          canonical,
          claims: splitClaims(canonical),
          saltHex: toHex(pinch),
          commitment: await goodCommitment(pinch, canonical),
        });
        setStep(2);
      })
      .catch((error: unknown) => setFileProblem(errorCode(error)));
  };

  const onCheck = (): void => {
    setChecking(true);
    setVerdict(null);
    const spec = (() => {
      try {
        return listingSpecJson(form, token, keyMode);
      } catch (error: unknown) {
        setVerdict({ ok: false, message: errorCode(error) });
        return null;
      }
    })();
    if (spec === null) {
      setChecking(false);
      return;
    }
    encode<boolean>('validate_spec', spec)
      .then(() => encodeArg('listing_spec_encode', spec))
      .then((base64) => {
        setSpecBase64(base64);
        setVerdict({
          ok: true,
          message: 'The core accepts this spec. These are the same checks create_listing makes.',
        });
        setStep(4);
      })
      .catch((error: unknown) => setVerdict({ ok: false, message: errorCode(error) }))
      .finally(() => setChecking(false));
  };

  const afterAction = (result: ActionResult<Listing | null>): void => {
    if ('error' in result) {
      setChainProblem(result.error);
      return;
    }
    if (result.ok === null) {
      setChainProblem('the chain has no listing for this account yet');
      return;
    }
    setListing(result.ok);
    setChainProblem(null);
  };

  const onCreate = (): void => {
    if (specBase64 === null || wallet.accountId === null) return;
    // Under RoomSealed there is nothing to create until the room is known: the good is sealed to
    // that one room, so a listing created without one could never be opened by anybody.
    if (roomSealed && target === null) {
      setChainProblem(targetProblem ?? 'the one room this listing would bind to is not known yet');
      return;
    }
    const seller = wallet.accountId;
    setChainBusy('create');
    setChainProblem(null);
    sendSellCall(
      wallet,
      keyMode,
      createListingTx(clearing, specBase64, fees.listing, keyMode, target),
    )
      // A wallet answers with a transaction hash, not a return value, so the id is read back.
      .then(() => settled(() => findListing(seller)))
      .then(afterAction)
      .catch((error: unknown) => setChainProblem(errorCode(error)))
      .finally(() => setChainBusy(null));
  };

  const onProvision = (): void => {
    if (listing === null) return;
    setChainBusy('provision');
    setChainProblem(null);
    sendSellCall(wallet, keyMode, beginProvisioningTx(clearing, listing.id))
      .then(() => settled(() => readListing(listing.id)))
      .then(afterAction)
      .catch((error: unknown) => setChainProblem(errorCode(error)))
      .finally(() => setChainBusy(null));
  };

  const onRefresh = (): void => {
    if (listing === null) return;
    setChainBusy('refresh');
    readListing(listing.id)
      .then(afterAction)
      .catch((error: unknown) => setChainProblem(errorCode(error)))
      .finally(() => setChainBusy(null));
  };

  const onSeal = (): void => {
    if (doc === null || listing === null || sealTo === null) return;
    setSealing(true);
    setSealProblem(null);
    sealAndUpload(
      {
        canonical: doc.canonical,
        saltHex: doc.saltHex,
        sealTo,
        listingId: listing.id,
        version: listing.version,
      },
      uploadBlob,
    )
      .then((object) => {
        setCiphertext(object.ciphertext);
        setSealed(object);
        setStep(6);
      })
      .catch((error: unknown) => setSealProblem(errorCode(error)))
      .finally(() => setSealing(false));
  };

  const onSetPins = (): void => {
    if (listing === null || fees.pins === null) return;
    const explicit = hashes
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    setPinsBusy(true);
    setPinsProblem(null);
    sendSellCall(
      wallet,
      keyMode,
      setPinsTx(keypolicy, listing.id, listing.version, follow ? null : explicit, fees.pins),
    )
      .then(() => {
        setKeysDone(true);
        setStep(7);
      })
      .catch((error: unknown) => setPinsProblem(errorCode(error)))
      .finally(() => setPinsBusy(false));
  };

  const onQuote = (): void => {
    setQuoting(true);
    setQuote(null);
    setQuoteProblem(null);
    const amount = (() => {
      try {
        return baseUnits(form.ask, 'the ask');
      } catch (error: unknown) {
        setQuoteProblem(errorCode(error));
        return null;
      }
    })();
    if (amount === null) {
      setQuoting(false);
      return;
    }
    askQuote({
      token,
      amount,
      refundTo: wallet.accountId ?? payout.account,
      recipient: payout.address,
      destinationAsset: payout.destinationAsset,
    })
      .then((result) => {
        if ('error' in result) {
          setQuoteProblem(result.error);
          return;
        }
        setQuote(result.ok ?? '1Click answered, but with no amount this page could read');
      })
      .catch((error: unknown) => setQuoteProblem(errorCode(error)))
      .finally(() => setQuoting(false));
  };

  const onPublish = (): void => {
    if (listing === null || publishBase64 === null) return;
    setPublishBusy(true);
    setPublishProblem(null);
    sendSellCall(
      wallet,
      keyMode,
      publishListingTx(clearing, listing.id, publishBase64, fees.publish),
    )
      .then(() => {
        setPublished(true);
        return readListing(listing.id);
      })
      .then(afterAction)
      .catch((error: unknown) => setPublishProblem(errorCode(error)))
      .finally(() => setPublishBusy(false));
  };

  /**
   * A step is open only once the one before it has produced what it produces: the canonical bytes,
   * the validated spec, the listing, the ciphertext, the pins. Offering a step whose input does not
   * exist yet is how a seller ends up with a listing that cannot be opened or released.
   */
  const reached = (want: number): boolean => {
    if (want === 1) return true;
    if (want <= 3) return doc !== null;
    if (want === 4) return specBase64 !== null;
    if (want === 5) return listing !== null;
    if (want === 6) return sealed !== null;
    return sealed !== null && keysDone;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">List a knowledge good</CardTitle>
        <CardDescription>
          The document is canonicalised, committed to and sealed in this browser. What reaches the
          chain is a commitment and a ciphertext hash; what reaches the gateway is ciphertext.{' '}
          {roomSealed
            ? 'This deployment releases keys under the RoomSealed fallback, so the good is sealed to one attested room and only that room can ever open it (SDD §3.12.7). Step 6 says what that costs.'
            : 'Only an attested room, holding the key this listing is provisioned with, can open it.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <Stepper value={step} onValueChange={setStep} className="w-full">
          <StepperNav className="gap-2">
            {steps.map((one) => (
              <StepperItem key={one.step} step={one.step} className="not-last:flex-1">
                <StepperTrigger className="gap-2" disabled={!reached(one.step)}>
                  <StepperIndicator>{one.step}</StepperIndicator>
                  <StepperTitle className="hidden sm:block">{one.title}</StepperTitle>
                </StepperTrigger>
                {one.step < steps.length ? <StepperSeparator /> : null}
              </StepperItem>
            ))}
          </StepperNav>

          <StepperPanel className="pt-6">
            <StepperContent value={1}>
              <StepFile name={doc?.name ?? null} problem={fileProblem} onFile={onFile} />
            </StepperContent>
            <StepperContent value={2}>
              {doc === null ? null : (
                <StepCanonical
                  name={doc.name}
                  canonical={doc.canonical}
                  claims={doc.claims}
                  saltHex={doc.saltHex}
                  commitment={doc.commitment}
                />
              )}
            </StepperContent>
            <StepperContent value={3}>
              <StepParameters
                form={form}
                token={token}
                checking={checking}
                verdict={verdict}
                onChange={setForm}
                onCheck={onCheck}
              />
            </StepperContent>
            <StepperContent value={4}>
              <StepCreate
                clearing={clearing}
                keyMode={keyMode}
                roomKey={target?.roomKey ?? null}
                specBase64={specBase64}
                listing={listing}
                busy={chainBusy}
                problem={chainProblem ?? targetProblem}
                signable={signable}
                listingFee={fees.listing}
                onCreate={onCreate}
                onProvision={onProvision}
                onRefresh={onRefresh}
              />
            </StepperContent>
            <StepperContent value={5}>
              <StepSeal
                keyMode={keyMode}
                sealTo={sealTo}
                sealed={sealed}
                busy={sealing}
                problem={sealProblem}
                onSeal={onSeal}
              />
            </StepperContent>
            <StepperContent value={6}>
              {roomSealed ? (
                <StepRoomSealed
                  keypolicy={keypolicy}
                  target={target}
                  problem={targetProblem}
                  acknowledged={keysDone}
                  onAcknowledge={() => {
                    setKeysDone(true);
                    setStep(7);
                  }}
                />
              ) : (
                <StepPins
                  keypolicy={keypolicy}
                  follow={follow}
                  hashes={hashes}
                  measured={measurements}
                  fee={fees.pins}
                  busy={pinsBusy}
                  problem={pinsProblem}
                  done={keysDone}
                  signable={signable}
                  onFollow={setFollow}
                  onHashes={setHashes}
                  onSet={onSetPins}
                />
              )}
            </StepperContent>
            <StepperContent value={7}>
              <StepPublish
                clearing={clearing}
                roomKey={roomSealed ? (target?.roomKey ?? null) : null}
                payout={payout}
                publishFee={fees.publish}
                publishBase64={publishBase64}
                quote={quote}
                quoting={quoting}
                quoteProblem={quoteProblem}
                busy={publishBusy}
                problem={publishProblem}
                published={published}
                signable={signable}
                onPayout={setPayout}
                onQuote={onQuote}
                onPublish={onPublish}
              />
            </StepperContent>
          </StepperPanel>
        </Stepper>

        {wallet.available ? null : (
          <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            No browser wallet knows this network, so the steps that sign —{' '}
            {steps
              .filter((one) => one.methods.length > 0)
              .map((one) => one.step)
              .join(', ')}{' '}
            — cannot be sent from this page. Everything else — canonicalisation, the commitment, the
            core&rsquo;s own validation, the seal and the upload — runs here regardless.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
