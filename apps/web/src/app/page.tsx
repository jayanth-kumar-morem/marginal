import { redirect } from 'next/navigation';

/** The market is the front door. */
export default function RootPage() {
  redirect('/listings');
}
