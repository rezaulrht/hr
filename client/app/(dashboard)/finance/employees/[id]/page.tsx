import { EmployeeDetailPage } from "@/components/profile/employee-detail-page"

export default async function Page({ params }: PageProps<"/finance/employees/[id]">) {
  const { id } = await params
  return <EmployeeDetailPage employeeId={id} backHref="/finance/employees" />
}
