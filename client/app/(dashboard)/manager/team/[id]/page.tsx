import { EmployeeDetailPage } from "@/components/profile/employee-detail-page"

export default async function Page({ params }: PageProps<"/manager/team/[id]">) {
  const { id } = await params
  return <EmployeeDetailPage employeeId={id} backHref="/manager/team" />
}
