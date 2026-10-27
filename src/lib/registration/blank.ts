import type { RegistrationInput } from './schema';

export type Person = RegistrationInput['people'][number];
export type Relation = Person['relation'];
type Address = Person['address'];

// A form draft: answers start empty (null for yes/no) and only the schema decides what is valid.
export function blankPerson(relation: Relation, address?: Address): Person {
	return {
		relation,
		fullName: '',
		nickname: '',
		chineseName: '',
		sex: undefined,
		birthDate: '',
		birthCityId: '',
		nik: '',
		email: '',
		phone: '',
		address: address ? { ...address } : { line: '', postalCode: '', cityId: '' },
		occupation: undefined,
		education: undefined,
		previousChurch: '',
		baptism: { baptized: null },
		sidi: { sidi: null },
		notChildOfSpouse: false
	} as unknown as Person;
}
