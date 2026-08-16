/** OCI Email Delivery approved senders, via instance principal auth. */

import {
  InstancePrincipalsAuthenticationDetailsProviderBuilder,
  OciError,
  Region,
} from "oci-common";
import { EmailClient } from "oci-email";

const config = () => {
  const { OCI_COMPARTMENT_OCID } = process.env;
  if (!OCI_COMPARTMENT_OCID) {
    throw new Error("OCI_COMPARTMENT_OCID env var is not set.");
  }
  return { compartmentId: OCI_COMPARTMENT_OCID };
};

let cached: Promise<EmailClient> | undefined;

/** Built on first use; instance principal auth is async. */
const client = (): Promise<EmailClient> => {
  cached ??= new InstancePrincipalsAuthenticationDetailsProviderBuilder()
    .build()
    .then((authenticationDetailsProvider) => {
      const email = new EmailClient({ authenticationDetailsProvider });
      email.region = Region.CA_TORONTO_1;
      return email;
    })
    .catch((error) => {
      cached = undefined;
      throw error;
    });
  return cached;
};

const isStatus = (error: unknown, status: number) =>
  error instanceof OciError && error.statusCode === status;

export const createApprovedSender = async (
  emailAddress: string,
): Promise<void> => {
  const { compartmentId } = config();
  const email = await client();
  try {
    await email.createSender({
      createSenderDetails: { compartmentId, emailAddress },
    });
  } catch (error) {
    if (!isStatus(error, 409)) throw error;
  }
};

export const deleteApprovedSender = async (
  emailAddress: string,
): Promise<void> => {
  const { compartmentId } = config();
  const email = await client();

  const { items } = await email.listSenders({ compartmentId, emailAddress });
  const sender = items.find((s) => s.emailAddress === emailAddress);
  if (!sender) return;

  try {
    await email.deleteSender({ senderId: sender.id });
  } catch (error) {
    if (!isStatus(error, 404)) throw error;
  }
};
