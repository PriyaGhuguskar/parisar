// Shared test data: a society structure as onboard_structure_for_code returns it.
export const STRUCTURE = {
  society_id: "s1",
  society_name: "Green Meadows",
  wings: [
    {
      id: "wA",
      name: "A",
      code: "A",
      floors: [
        { id: "f1", number: 1, name: null },
        { id: "f0", number: 0, name: null },
      ],
      flats: [
        { id: "a101", number: "101", floor_id: "f1", taken: false },
        { id: "a102", number: "102", floor_id: "f1", taken: true },
        { id: "a001", number: "001", floor_id: null, taken: false },
      ],
    },
    {
      id: "wM",
      name: "Main",
      code: null,
      floors: [],
      flats: [{ id: "m1", number: "1", floor_id: null, taken: false }],
    },
    { id: "wE", name: "Empty", code: null, floors: [], flats: [] },
  ],
};
