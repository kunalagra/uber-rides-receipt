/**
 * GraphQL queries for Uber's internal API
 */

export const CURRENT_USER_QUERY = {
	operationName: "CurrentUserRidersWeb",
	variables: {
		includeDelegateProfiles: true,
		includeUserMemberships: true,
		useUberCashBalanceBreakdown: false,
	},
	query: `query CurrentUserRidersWeb($includeDelegateProfiles: Boolean = false, $includeUserMemberships: Boolean = false, $useUberCashBalanceBreakdown: Boolean = false) {
  currentUser {
    ...RVWebUserFragment
    email
    formattedNumber
    languageId
    lastName
    role
    signupCountry
    userTags {
      ...RVWebUserTagsFragment
      __typename
    }
    profileBalance
    paymentProfiles {
      ...RVWebPaymentProfileFragment
      __typename
    }
    profiles {
      ...RVWebProfileFragment
      __typename
    }
    uberCashBalances(useUberCashBalanceBreakdown: $useUberCashBalanceBreakdown) {
      ...RVWebCashBalanceFragment
      __typename
    }
    membershipBenefits @include(if: $includeUserMemberships) {
      ...RVWebMembershipBenefitsFragment
      __typename
    }
    __typename
  }
}

fragment RVWebCashBalanceFragment on RVWebCommonUberCashBalance {
  amount
  currency
  balances @include(if: $useUberCashBalanceBreakdown) {
    defaultDisplay {
      paymentProfile
      title
      subtitle
      subtitleColor
      __typename
    }
    overrides {
      paymentProfile
      title
      subtitle
      subtitleColor
      __typename
    }
    __typename
  }
  __typename
}

fragment RVWebMembershipBenefitsFragment on RVWebCommonMembershipBenefits {
  hasUberOne
  rideBenefits {
    ...RVWebRideBenefitFragment
    __typename
  }
  __typename
}

fragment RVWebPaymentProfileFragment on RVWebCommonPaymentProfile {
  authenticationType
  displayable {
    displayName
    iconURL
    __typename
  }
  hasBalance
  tokenType
  uuid
  __typename
}

fragment RVWebProfileFragment on RVWebCommonProfile {
  defaultPaymentProfileUuid
  managedBusinessProfileAttributes {
    isBilledToCompany
    logoUrl
    ridePolicy {
      expenseCodeRequiredMode
      isCustomExpenseCodeAllowed
      __typename
    }
    __typename
  }
  delegateProfileAttributes @include(if: $includeDelegateProfiles) {
    delegatorAttributes {
      delegatedProfileUUID
      uuid
      firstName
      lastName
      pictureUrl
      __typename
    }
    role
    __typename
  }
  extraProfileAttributes {
    microSMBAttributes {
      isEnabled
      microSMBType
      __typename
    }
    __typename
  }
  name
  secondaryPaymentProfileUuid
  type
  uuid
  __typename
}

fragment RVWebRideBenefitFragment on RVWebCommonUserRideBenefit {
  currencyCode
  parentProductTypeUUID
  percentage
  type
  __typename
}

fragment RVWebUserFragment on RVWebCommonUser {
  firstName
  lastName
  lastSelectedPaymentProfileUuid
  pictureUrl
  rating
  tenancy
  uuid
  __typename
}

fragment RVWebUserTagsFragment on RVWebCommonUserTags {
  hasDelegate
  isAdmin
  isTester
  isTeen
  __typename
}`,
};

export const ACTIVITIES_QUERY = {
	operationName: "Activities",
	query: `query Activities($cityID: Int, $endTimeMs: Float, $includePast: Boolean = true, $includeUpcoming: Boolean = true, $limit: Int = 5, $nextPageToken: String, $orderTypes: [RVWebCommonActivityOrderType!] = [RIDES, TRAVEL], $profileType: RVWebCommonActivityProfileType = PERSONAL, $startTimeMs: Float) {
  activities(cityID: $cityID) {
    cityID
    past(
      endTimeMs: $endTimeMs
      limit: $limit
      nextPageToken: $nextPageToken
      orderTypes: $orderTypes
      profileType: $profileType
      startTimeMs: $startTimeMs
    ) @include(if: $includePast) {
      activities {
        ...RVWebCommonActivityFragment
        __typename
      }
      nextPageToken
      __typename
    }
    upcoming @include(if: $includeUpcoming) {
      activities {
        ...RVWebCommonActivityFragment
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment RVWebCommonActivityFragment on RVWebCommonActivity {
  buttons {
    isDefault
    startEnhancerIcon
    text
    url
    __typename
  }
  cardURL
  description
  imageURL {
    light
    dark
    __typename
  }
  subtitle
  title
  uuid
  __typename
}`,
};

export const GET_TRIP_QUERY = {
	operationName: "GetTrip",
	query: `query GetTrip($tripUUID: String!) {
  getTrip(tripUUID: $tripUUID) {
    trip {
      beginTripTime
      cityID
      countryID
      disableCanceling
      disableRating
      disableResendReceipt
      driver
      dropoffTime
      fare
      guest
      isRidepoolTrip
      isScheduledRide
      isSurgeTrip
      isUberReserve
      jobUUID
      marketplace
      paymentProfileUUID
      showRating
      status
      uuid
      vehicleDisplayName
      vehicleViewID
      waypoints
      __typename
    }
    mapURL
    polandTaxiLicense
    rating
    reviewer
    receipt {
      carYear
      distance
      distanceLabel
      duration
      vehicleType
      __typename
    }
    concierge {
      sourceType
      __typename
    }
    organization {
      name
      __typename
    }
    __typename
  }
}`,
};

export const GET_INVOICE_FILES_QUERY = {
	operationName: "GetInvoiceFiles",
	query: `query GetInvoiceFiles($tripUUID: ID!) {
  invoiceFiles(tripUUID: $tripUUID) {
    archiveURL
    files {
      downloadURL
      __typename
    }
    __typename
  }
}`,
};

/**
 * Helper to build activities query variables
 */
export function buildActivitiesVariables(options: {
	limit?: number;
	nextPageToken?: string;
	startTimeMs?: number;
	endTimeMs?: number;
}) {
	return {
		includePast: true,
		includeUpcoming: false,
		limit: options.limit ?? 50,
		orderTypes: ["RIDES", "TRAVEL"],
		profileType: "PERSONAL",
		...(options.nextPageToken && { nextPageToken: options.nextPageToken }),
		...(options.startTimeMs && { startTimeMs: options.startTimeMs }),
		...(options.endTimeMs && { endTimeMs: options.endTimeMs }),
	};
}
