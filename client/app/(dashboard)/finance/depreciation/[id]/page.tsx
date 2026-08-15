import { RunDetailPage } from "@/components/depreciation/run-detail-page"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RunDetailPage id={id} />
}
