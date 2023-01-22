import { LicenseInfo } from '@mui/x-license-pro';
import Table from '@/Table';

LicenseInfo.setLicenseKey(process.env.NEXT_PUBLIC_SECRET_KEY ?? "");

console.table(process.env.NEXT_PUBLIC_SECRET_KEY)

export default function Home() {
  return (
    <div>
      <Table />
    </div>
  )
}
