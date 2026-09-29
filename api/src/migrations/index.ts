import { CreateUsersTable1789126650654 } from './1789126650654-CreateUsersTable';
import { CreateEventsTable1789128552870 } from './1789128552870-CreateEventsTable';
import { CreateTicketTypesTable1789130230394 } from './1789130230394-CreateTicketTypesTable';
import { CreateTransactionsTable1789130935664 } from './1789130935664-CreateTransactionsTable';
import { CreateTicketsTable1789131314262 } from './1789131314262-CreateTicketsTable';
import { AddTicketsEventStatusIndex1789395702417 } from './1789395702417-AddTicketsEventStatusIndex';
import { AddTicketStateConstraints1789481720250 } from './1789481720250-AddTicketStateConstraints';
import { TightenTicketStateConstraints1789482814642 } from './1789482814642-TightenTicketStateConstraints';
import { UpdateUsersTableWithPasswordHash1789560380262 } from './1789560380262-UpdateUsersTableWithPasswordHash';
import { CreateRefreshTokensTable1789568195344 } from './1789568195344-CreateRefreshTokensTable';

export const migrations = [
  CreateUsersTable1789126650654,
  CreateEventsTable1789128552870,
  CreateTicketTypesTable1789130230394,
  CreateTransactionsTable1789130935664,
  CreateTicketsTable1789131314262,
  AddTicketsEventStatusIndex1789395702417,
  AddTicketStateConstraints1789481720250,
  TightenTicketStateConstraints1789482814642,
  UpdateUsersTableWithPasswordHash1789560380262,
  CreateRefreshTokensTable1789568195344,
];
